package services

import (
	"crypto/md5"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

// ImageCache provides caching for artwork images
type ImageCache struct {
	cacheDir string
	mu       sync.RWMutex
}

// NewImageCache creates a new image cache
func NewImageCache(cacheDir string) (*ImageCache, error) {
	if cacheDir == "" {
		cacheDir = ".cache/images"
	}
	if err := os.MkdirAll(cacheDir, 0755); err != nil {
		return nil, err
	}
	return &ImageCache{cacheDir: cacheDir}, nil
}

// getCacheKey generates a cache key from URL
func (c *ImageCache) getCacheKey(url string) string {
	hash := md5.Sum([]byte(url))
	return fmt.Sprintf("%x", hash)
}

// getCachePath returns the file path for a cached image
func (c *ImageCache) getCachePath(url string) string {
	key := c.getCacheKey(url)
	// Extract extension from URL
	ext := ".jpg"
	if strings.Contains(url, ".png") {
		ext = ".png"
	} else if strings.Contains(url, ".webp") {
		ext = ".webp"
	}
	return filepath.Join(c.cacheDir, key+ext)
}

// Get retrieves an image from cache or downloads it
func (c *ImageCache) Get(url string) ([]byte, string, error) {
	if url == "" {
		return nil, "", fmt.Errorf("empty URL")
	}

	cachePath := c.getCachePath(url)

	// Check if cached
	c.mu.RLock()
	data, err := os.ReadFile(cachePath)
	c.mu.RUnlock()

	if err == nil {
		contentType := "image/jpeg"
		if strings.HasSuffix(cachePath, ".png") {
			contentType = "image/png"
		} else if strings.HasSuffix(cachePath, ".webp") {
			contentType = "image/webp"
		}
		log.Printf("Image cache hit: %s", url)
		return data, contentType, nil
	}

	// Download and cache (with fallback for artist images that may return 403)
	log.Printf("Image cache miss, downloading: %s", url)
	data, contentType, actualURL, err := c.downloadWithFallbackRetry(url)
	if err != nil {
		return nil, "", err
	}

	// Save to cache using the original URL as key (so future requests hit cache)
	c.mu.Lock()
	if err := os.WriteFile(cachePath, data, 0644); err != nil {
		log.Printf("Failed to cache image: %v", err)
	}
	// If we used a fallback URL, also cache it under that key
	if actualURL != url {
		fallbackCachePath := c.getCachePath(actualURL)
		if err := os.WriteFile(fallbackCachePath, data, 0644); err != nil {
			log.Printf("Failed to cache fallback image: %v", err)
		}
	}
	c.mu.Unlock()

	return data, contentType, nil
}

// download fetches an image from URL with retry logic
func (c *ImageCache) download(url string) ([]byte, string, error) {
	const maxRetries = 3
	var lastErr error

	for attempt := 0; attempt < maxRetries; attempt++ {
		if attempt > 0 {
			// Exponential backoff: 500ms, 1s, 2s
			backoff := time.Duration(1<<uint(attempt-1)) * 500 * time.Millisecond
			log.Printf("Image download retry %d/%d after %v: %s", attempt+1, maxRetries, backoff, url)
			time.Sleep(backoff)
		}

		data, contentType, err := c.downloadOnce(url)
		if err == nil {
			return data, contentType, nil
		}
		lastErr = err
		log.Printf("Image download attempt %d failed: %v", attempt+1, err)
	}

	return nil, "", fmt.Errorf("failed after %d retries: %w", maxRetries, lastErr)
}

// downloadWithFallbackRetry tries to download with fallback sizes and retry logic
func (c *ImageCache) downloadWithFallbackRetry(url string) ([]byte, string, string, error) {
	const maxRetries = 2
	var lastErr error

	for attempt := 0; attempt < maxRetries; attempt++ {
		if attempt > 0 {
			backoff := time.Duration(1<<uint(attempt-1)) * 500 * time.Millisecond
			log.Printf("Image download with fallback retry %d/%d after %v: %s", attempt+1, maxRetries, backoff, url)
			time.Sleep(backoff)
		}

		data, contentType, actualURL, err := c.downloadWithFallback(url)
		if err == nil {
			return data, contentType, actualURL, nil
		}
		lastErr = err
		log.Printf("Image download with fallback attempt %d failed: %v", attempt+1, err)
	}

	return nil, "", "", fmt.Errorf("failed after %d retries with fallback: %w", maxRetries, lastErr)
}

// downloadOnce performs a single download attempt
func (c *ImageCache) downloadOnce(url string) ([]byte, string, error) {
	client := &http.Client{
		Timeout: 30 * time.Second,
	}

	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, "", err
	}

	// Set headers to mimic browser request
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
	req.Header.Set("Accept", "image/webp,image/apng,image/*,*/*;q=0.8")
	req.Header.Set("Referer", "https://music.apple.com/")

	resp, err := client.Do(req)
	if err != nil {
		return nil, "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, "", fmt.Errorf("failed to download image: %s", resp.Status)
	}

	data, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, "", err
	}

	contentType := resp.Header.Get("Content-Type")
	if contentType == "" {
		contentType = "image/jpeg"
	}

	return data, contentType, nil
}

// downloadWithFallback tries to download an image, falling back to smaller sizes if needed
// This is specifically for Apple Music artist images which may return 403 for certain sizes
func (c *ImageCache) downloadWithFallback(url string) ([]byte, string, string, error) {
	// First try the original URL
	data, contentType, err := c.downloadOnce(url)
	if err == nil {
		return data, contentType, url, nil
	}

	// Check if it's a 403 error and if the URL contains size placeholders that we can adjust
	if !strings.Contains(err.Error(), "403") {
		return nil, "", "", err
	}

	// Try fallback sizes for artist images (Apple Music restricts certain intermediate sizes)
	// Valid sizes are typically: 300, 500, 1000, and the original size (e.g., 2400, 3000)
	fallbackSizes := []int{1000, 500, 300}

	for _, size := range fallbackSizes {
		fallbackURL := c.tryResizeURL(url, size)
		if fallbackURL == url {
			continue // No change, skip
		}

		log.Printf("Trying fallback size %d for image: %s", size, fallbackURL)
		data, contentType, err := c.downloadOnce(fallbackURL)
		if err == nil {
			log.Printf("Fallback successful at size %d", size)
			return data, contentType, fallbackURL, nil
		}
	}

	return nil, "", "", fmt.Errorf("failed to download image with all fallback sizes: %s", url)
}

// tryResizeURL attempts to modify the URL to use a different size
func (c *ImageCache) tryResizeURL(url string, size int) string {
	// Pattern: /NNNxNNNbb.jpg or /NNNxNNN.jpg
	// We need to replace the size in the URL

	sizeStr := fmt.Sprintf("%d", size)

	// Try to find and replace size patterns
	// Common patterns: 300x300, 500x500, 1000x1000, 1500x1500, 2000x2000, etc.
	for _, oldSize := range []int{3840, 3000, 2400, 2000, 1500, 1200, 800, 600, 400, 256, 200, 128} {
		oldPattern := fmt.Sprintf("%dx%d", oldSize, oldSize)
		newPattern := fmt.Sprintf("%sx%s", sizeStr, sizeStr)
		if strings.Contains(url, oldPattern) {
			return strings.Replace(url, oldPattern, newPattern, 1)
		}
	}

	return url
}

// Clear removes all cached images
func (c *ImageCache) Clear() error {
	c.mu.Lock()
	defer c.mu.Unlock()
	return os.RemoveAll(c.cacheDir)
}

// Global image cache instance
var globalImageCache *ImageCache
var imageCacheOnce sync.Once

// GetImageCache returns the global image cache instance
func GetImageCache() *ImageCache {
	imageCacheOnce.Do(func() {
		var err error
		globalImageCache, err = NewImageCache(".cache/images")
		if err != nil {
			log.Printf("Failed to create image cache: %v", err)
		}
	})
	return globalImageCache
}
