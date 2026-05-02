package api

// ServerConfig holds the configuration for the HTTP API server
type ServerConfig struct {
	Port         string `yaml:"port"`
	Host         string `yaml:"host"`
	CORSOrigins  string `yaml:"cors-origins"`
	CacheDir     string `yaml:"cache-dir"`
	MaxCacheSize int64  `yaml:"max-cache-size"` // in MB
	EnableCache  bool   `yaml:"enable-cache"`
	StaticDir    string `yaml:"static-dir"`
}

// DatabaseConfig holds PostgreSQL connection configuration (YAML tags for config parsing)
type DatabaseConfig struct {
	Host         string `yaml:"host"`
	Port         int    `yaml:"port"`
	User         string `yaml:"user"`
	Password     string `yaml:"password"`
	DBName       string `yaml:"dbname"`
	SSLMode      string `yaml:"sslmode"`
	MaxOpenConns int    `yaml:"max-open-conns"`
	MaxIdleConns int    `yaml:"max-idle-conns"`
}

// ToServiceConfig converts API DatabaseConfig to services.DatabaseConfig
func (c *DatabaseConfig) ToServiceConfig() interface{} {
	return c
}

// JWTConfig holds JWT authentication configuration
type JWTConfig struct {
	SecretKey          string `yaml:"secret-key"`
	AccessTokenExpiry  int    `yaml:"access-token-expiry"`  // in minutes
	RefreshTokenExpiry int    `yaml:"refresh-token-expiry"` // in hours
}

// EmailConfig holds SMTP email configuration
type EmailConfig struct {
	SMTPHost     string `yaml:"smtp-host"`
	SMTPPort     int    `yaml:"smtp-port"`
	SMTPUser     string `yaml:"smtp-user"`
	SMTPPassword string `yaml:"smtp-password"`
	FromAddress  string `yaml:"from-address"`
	FromName     string `yaml:"from-name"`
}

// DefaultServerConfig returns the default server configuration
func DefaultServerConfig() *ServerConfig {
	return &ServerConfig{
		Port:         "8080",
		Host:         "0.0.0.0",
		CORSOrigins:  "*",
		CacheDir:     ".cache/audio",
		MaxCacheSize: 1024, // 1GB
		EnableCache:  true,
		StaticDir:    "frontend/dist",
	}
}

// DefaultDatabaseConfig returns the default database configuration
func DefaultDatabaseConfig() *DatabaseConfig {
	return &DatabaseConfig{
		Host:         "localhost",
		Port:         5432,
		User:         "postgres",
		Password:     "",
		DBName:       "music_app",
		SSLMode:      "disable",
		MaxOpenConns: 25,
		MaxIdleConns: 5,
	}
}

// DefaultJWTConfig returns the default JWT configuration
func DefaultJWTConfig() *JWTConfig {
	return &JWTConfig{
		SecretKey:          "change-this-secret-key-in-production",
		AccessTokenExpiry:  15,  // 15 minutes
		RefreshTokenExpiry: 168, // 7 days
	}
}

// DefaultEmailConfig returns the default email configuration
func DefaultEmailConfig() *EmailConfig {
	return &EmailConfig{
		SMTPHost:     "localhost",
		SMTPPort:     587,
		SMTPUser:     "",
		SMTPPassword: "",
		FromAddress:  "noreply@example.com",
		FromName:     "Music App",
	}
}
