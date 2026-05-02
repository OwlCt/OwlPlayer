package models

import (
	"fmt"
	"strings"
)

// replaceArtworkSize replaces the {w}x{h} placeholder in artwork URLs
func replaceArtworkSize(url string, width, height int) string {
	size := fmt.Sprintf("%dx%d", width, height)
	return strings.Replace(url, "{w}x{h}", size, 1)
}
