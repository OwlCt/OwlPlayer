package main

import (
	"context"
	"log"
	"time"

	"github.com/OwlCt/OwlPlayer/api"
	"github.com/OwlCt/OwlPlayer/models"
	"github.com/OwlCt/OwlPlayer/services"
	"github.com/OwlCt/OwlPlayer/utils/ampapi"
)

func main() {
	configManager := services.NewConfigFileManager(services.GetConfigPath())
	fileConfig, err := configManager.Load()
	if err != nil {
		log.Fatalf("Failed to read config from %s: %v", services.GetConfigPath(), err)
	}

	runtimeConfigSet := fileConfig.ConfigSet
	runtimeEmailConfig := fileConfig.Email
	runtimeLocalMediaConfig := fileConfig.LocalMedia

	// Get API token
	token, err := ampapi.GetToken()
	if err != nil {
		log.Printf("Warning: Failed to get token: %v", err)
	} else {
		log.Printf("Token obtained: %s...", token[:20])
	}

	// Create server config
	serverConfig := api.DefaultServerConfig()

	// Initialize JWT service from bootstrap config.
	jwtConfig := &services.JWTConfig{
		SecretKey:          fileConfig.JWT.SecretKey,
		AccessTokenExpiry:  time.Duration(fileConfig.JWT.AccessTokenExpiry) * time.Minute,
		RefreshTokenExpiry: time.Duration(fileConfig.JWT.RefreshTokenExpiry) * time.Hour,
	}
	if jwtConfig.SecretKey == "" {
		jwtConfig.SecretKey = "change-this-secret-key-in-production"
	}
	if jwtConfig.AccessTokenExpiry == 0 {
		jwtConfig.AccessTokenExpiry = 15 * time.Minute
	}
	if jwtConfig.RefreshTokenExpiry == 0 {
		jwtConfig.RefreshTokenExpiry = 168 * time.Hour
	}
	jwtService := services.NewJWTService(jwtConfig)

	dbConfig := fileConfig.Database
	dbConfig.ApplyDefaults()

	db, err := services.NewDatabase(&dbConfig)
	if err != nil {
		log.Printf("Warning: Failed to connect to database: %v", err)
		log.Printf("User account features will be disabled")
		db = nil
	} else {
		// Verify database connectivity
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := db.HealthCheck(ctx); err != nil {
			log.Printf("Warning: Database health check failed: %v", err)
			log.Printf("User account features will be disabled")
			db.Close()
			db = nil
		} else {
			log.Printf("Database connected successfully")

			// Run migrations
			if err := db.RunMigrations(context.Background(), "migrations"); err != nil {
				log.Printf("Warning: Failed to run migrations: %v", err)
			} else {
				log.Printf("Database migrations completed")
			}
		}
	}

	var localLibraryRepo *services.LocalLibraryDBRepository
	var localMediaScanner *services.LocalMediaScanner
	var localMetadataEnhancer *services.LocalMetadataEnhancer
	var localMetadataControlService *services.LocalMetadataControlService
	var localLibraryAdminService *services.LocalLibraryAdminService
	var localLibraryService *services.LocalLibraryService
	var systemSettingsService *services.SystemSettingsService
	var runtimeSettings *services.RuntimeSettingsEnvelope

	var userService *services.UserService
	var authMiddleware *api.AuthMiddleware
	var avatarService *services.AvatarService
	var emailService *services.EmailService

	if db != nil {
		systemSettingsService = services.NewSystemSettingsService(db)
		if _, err := systemSettingsService.SeedRuntimeSettingsFromConfig(context.Background(), fileConfig); err != nil {
			log.Printf("Warning: Failed to seed runtime settings from legacy config: %v", err)
		}
		runtimeSettings, err = systemSettingsService.GetRuntimeSettings(context.Background())
		if err != nil {
			log.Printf("Warning: Failed to load runtime settings from database: %v", err)
		} else {
			runtimeConfigSet.Storefront = runtimeSettings.AppleMusic.Storefront
			runtimeConfigSet.Language = runtimeSettings.AppleMusic.Language
			runtimeConfigSet.MediaUserToken = runtimeSettings.AppleMusic.MediaUserToken
			runtimeEmailConfig = *runtimeSettings.Email.ToEmailConfig()
			if cfg := services.BuildLocalMediaConfig(runtimeSettings); cfg != nil {
				runtimeLocalMediaConfig = *cfg
			}
		}
		if err := systemSettingsService.MarkRuntimeSettingsApplied(context.Background()); err != nil {
			log.Printf("Warning: Failed to clear runtime restart marker: %v", err)
		}

		emailService = services.NewEmailService(&runtimeEmailConfig)

		// Initialize user service
		userService = services.NewUserService(db, emailService, jwtService)
		if err := userService.EnsureSchema(context.Background()); err != nil {
			log.Printf("Warning: Failed to ensure user schema: %v", err)
		}

		// Initialize avatar service
		avatarConfig := services.DefaultAvatarConfig()
		avatarService, err = services.NewAvatarService(avatarConfig)
		if err != nil {
			log.Printf("Warning: Failed to initialize avatar service: %v", err)
		}

		// Initialize auth middleware
		authMiddleware = api.NewAuthMiddleware(jwtService, userService)

		log.Printf("User account services initialized")
	}

	if err := services.ValidateRuntimeLocalMediaConfig(&runtimeLocalMediaConfig, runtimeConfigSet.Storefront, runtimeConfigSet.MediaUserToken); err != nil {
		log.Printf("Warning: Invalid runtime local media config, disabling local media: %v", err)
		runtimeLocalMediaConfig = services.DefaultLocalMediaConfig()
	}
	if runtimeLocalMediaConfig.Enabled {
		log.Printf(
			"Local media library enabled with %d roots, scan mode %s, cleanup policy %s",
			len(runtimeLocalMediaConfig.Roots),
			runtimeLocalMediaConfig.ScanMode,
			runtimeLocalMediaConfig.CleanupPolicy,
		)
	}

	// Create and start server
	server, err := api.NewServer(serverConfig)
	if err != nil {
		log.Fatalf("Failed to create server: %v", err)
	}

	setupService := services.NewSetupService(configManager, db, systemSettingsService, jwtService, emailService)
	setupHandler := api.NewSetupHandler(setupService, jwtService)
	setupHandler.RegisterRoutes(server.Mux())

	var localHLSCacheService *services.HLSCacheService
	if db != nil {
		localLibraryAdminService = services.NewLocalLibraryAdminService(db, localLibraryRepo, localMediaScanner, localMetadataEnhancer, runtimeLocalMediaConfig)
	}
	if db != nil && runtimeLocalMediaConfig.Enabled {
		localLibraryRepo = services.NewLocalLibraryDBRepository(db)
		localMetadataEnhancer = services.NewLocalMetadataEnhancer(localLibraryRepo, runtimeLocalMediaConfig, runtimeConfigSet.Storefront, runtimeConfigSet.Language, token, runtimeConfigSet.MediaUserToken)
		localMetadataControlService = services.NewLocalMetadataControlService(db, localLibraryRepo, runtimeLocalMediaConfig, runtimeConfigSet.Storefront, runtimeConfigSet.Language, token)
		localMediaScanner = services.NewLocalMediaScanner(localLibraryRepo, runtimeLocalMediaConfig)
		localMediaScanner.SetMetadataEnhancer(localMetadataEnhancer)
		switch runtimeLocalMediaConfig.ScanMode {
		case models.LibraryScanModeStartupFull, models.LibraryScanModeStartupIncremental:
			go func() {
				if err := localMediaScanner.RunConfiguredStartupScan(context.Background()); err != nil {
					log.Printf("Warning: Local media startup scan failed: %v", err)
				}
			}()
			log.Printf("Local media startup scan scheduled with mode %s", runtimeLocalMediaConfig.ScanMode)
		case models.LibraryScanModeManual:
			log.Printf("Local media scan mode is manual; startup scan skipped")
		case models.LibraryScanModeScheduled:
			log.Printf("Local media scan mode is scheduled; scheduler is not wired yet, startup scan skipped")
		default:
			log.Printf("Warning: Unknown local media scan mode %s; startup scan skipped", runtimeLocalMediaConfig.ScanMode)
		}

		localLibraryAdminService = services.NewLocalLibraryAdminService(db, localLibraryRepo, localMediaScanner, localMetadataEnhancer, runtimeLocalMediaConfig)
		localLibraryService = services.NewLocalLibraryService(db, localLibraryRepo)
		localLibraryService.SetMetadataControlService(localMetadataControlService)
		localLyricsService := services.NewLocalLyricsService(localLibraryRepo, localMetadataEnhancer, runtimeLocalMediaConfig, runtimeConfigSet.Storefront, runtimeConfigSet.Language, token, runtimeConfigSet.MediaUserToken)
		localHLSCacheService, err = services.NewHLSCacheService(".cache/hls", systemSettingsService)
		if err != nil {
			log.Printf("Warning: Failed to initialize local HLS cache service: %v", err)
		}
		server.SetLocalPlaybackService(services.NewLocalPlaybackService(localLibraryRepo, localHLSCacheService))
		log.Printf("Local playback service configured")
		server.SetLocalLibraryServices(localLibraryService, localLyricsService)
		log.Printf("Local library API services configured")
	}

	// Set auth middleware for protected routes
	if authMiddleware != nil {
		server.SetAuthMiddleware(authMiddleware)
		log.Printf("Auth middleware configured for protected routes")
	}

	// Set user service for user preferences (Chinese variant)
	if userService != nil {
		server.SetUserService(userService)
		log.Printf("User service configured for preferences")
	}

	// Register auth routes if services are available
	if userService != nil && jwtService != nil && authMiddleware != nil {
		authHandler := api.NewAuthHandler(userService, jwtService)
		authHandler.RegisterRoutes(server.Mux(), authMiddleware)

		adminHandler := api.NewAdminHandler(userService, authMiddleware)
		adminHandler.SetSystemSettingsService(systemSettingsService)
		adminHandler.SetEmailService(emailService)
		adminHandler.RegisterRoutes(server.Mux())

		adminLocalLibraryHandler := api.NewAdminLocalLibraryHandler(localLibraryAdminService, localMetadataControlService, localLibraryService, authMiddleware)
		adminLocalLibraryHandler.RegisterRoutes(server.Mux())

		userHandler := api.NewUserHandler(userService, avatarService, authMiddleware)
		userHandler.RegisterRoutes(server.Mux())

		// Initialize liked songs service and handler
		likedSongsService := services.NewLikedSongsService(db)
		likedSongsService.SetLocalLibraryRepository(localLibraryRepo)
		likedSongsHandler := api.NewLikedSongsHandler(likedSongsService, authMiddleware)
		likedSongsHandler.RegisterRoutes(server.Mux())

		// Initialize library albums service and handler
		libraryAlbumsService := services.NewLibraryAlbumsService(db)
		libraryAlbumsService.SetLocalLibraryRepository(localLibraryRepo)
		libraryAlbumsHandler := api.NewLibraryAlbumsHandler(libraryAlbumsService, authMiddleware)
		libraryAlbumsHandler.RegisterRoutes(server.Mux())

		// Initialize playlists database service and handler
		playlistsDBService := services.NewPlaylistsDBService(db)
		playlistsDBService.SetLocalLibraryRepository(localLibraryRepo)
		// Ensure artist_id column exists in playlist_songs table
		if err := playlistsDBService.EnsureArtistIDColumn(context.Background()); err != nil {
			log.Printf("Warning: Failed to ensure artist_id column: %v", err)
		}

		// Initialize playlist cover service
		playlistCoverConfig := services.DefaultPlaylistCoverConfig()
		playlistCoverService, err := services.NewPlaylistCoverService(playlistCoverConfig)
		if err != nil {
			log.Printf("Warning: Failed to initialize playlist cover service: %v", err)
		}

		playlistsDBHandler := api.NewPlaylistsDBHandler(playlistsDBService, playlistCoverService, authMiddleware)
		playlistsDBHandler.RegisterRoutes(server.Mux())

		// Initialize followed artists service and handler
		followedArtistsService := services.NewFollowedArtistsService(db)
		followedArtistsService.SetLocalLibraryRepository(localLibraryRepo)
		followedArtistsHandler := api.NewFollowedArtistsHandler(followedArtistsService, authMiddleware)
		followedArtistsHandler.RegisterRoutes(server.Mux())

		// Initialize playback state service and handler
		playbackStateService := services.NewPlaybackStateService(db)
		playbackStateService.SetLocalLibraryRepository(localLibraryRepo)
		playbackStateHandler := api.NewPlaybackStateHandler(playbackStateService, authMiddleware)
		playbackStateHandler.RegisterRoutes(server.Mux())

		adminRuntimeSettingsHandler := api.NewAdminRuntimeSettingsHandler(systemSettingsService, emailService, authMiddleware)
		adminRuntimeSettingsHandler.RegisterRoutes(server.Mux())

		adminFilesystemHandler := api.NewAdminFilesystemHandler(authMiddleware)
		adminFilesystemHandler.RegisterRoutes(server.Mux())

		// Initialize recently played service and handler
		recentlyPlayedService := services.NewRecentlyPlayedService(db)
		recentlyPlayedService.SetLocalLibraryRepository(localLibraryRepo)
		recentlyPlayedHandler := api.NewRecentlyPlayedHandler(recentlyPlayedService, authMiddleware)
		recentlyPlayedHandler.RegisterRoutes(server.Mux())

		// Initialize play history service and handler
		playHistoryService := services.NewPlayHistoryService(db)
		playHistoryService.SetLocalLibraryRepository(localLibraryRepo)
		playHistoryHandler := api.NewPlayHistoryHandler(playHistoryService, authMiddleware)
		playHistoryHandler.RegisterRoutes(server.Mux())

		if runtimeLocalMediaConfig.Enabled && localHLSCacheService != nil {
			adminHLSCacheHandler := api.NewAdminHLSCacheHandler(localHLSCacheService, authMiddleware)
			adminHLSCacheHandler.RegisterRoutes(server.Mux())
			log.Printf("Admin HLS cache routes registered")
		}

		log.Printf("Auth routes registered")
		log.Printf("Liked songs routes registered")
		log.Printf("Library albums routes registered")
		log.Printf("Playlists (DB) routes registered")
		log.Printf("Followed artists routes registered")
		log.Printf("Playback state routes registered")
		log.Printf("Recently played routes registered")
		log.Printf("Play history routes registered")
	}

	log.Printf("Streaming Player API Server")
	log.Printf("Endpoints:")
	log.Printf("  GET  /api/search?q={query}&type={album|song|artist}")
	log.Printf("  GET  /api/stream/{songId}")
	log.Printf("  GET  /api/lyrics/{songId}")
	if userService != nil {
		log.Printf("  POST /api/auth/register")
		log.Printf("  POST /api/auth/login")
		log.Printf("  POST /api/auth/verify-email")
		log.Printf("  GET  /api/user/settings")
		log.Printf("  GET  /api/admin/users")
		log.Printf("  GET  /api/playback-state")
		log.Printf("  POST /api/playback-state")
	}

	if err := server.Start(); err != nil {
		log.Fatalf("Server error: %v", err)
	}
}
