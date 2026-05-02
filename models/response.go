package models

// APIResponse is the standard response structure for all API endpoints
type APIResponse struct {
	Status string      `json:"status"` // "success" or "error"
	Data   interface{} `json:"data,omitempty"`
	Error  *APIError   `json:"error,omitempty"`
}

// APIError represents an error in the API response
type APIError struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

// NewSuccessResponse creates a success response with data
func NewSuccessResponse(data interface{}) *APIResponse {
	return &APIResponse{
		Status: "success",
		Data:   data,
	}
}

// NewErrorResponse creates an error response
func NewErrorResponse(code, message string) *APIResponse {
	return &APIResponse{
		Status: "error",
		Error: &APIError{
			Code:    code,
			Message: message,
		},
	}
}

// IsValid checks if the response has a valid structure
func (r *APIResponse) IsValid() bool {
	if r.Status != "success" && r.Status != "error" {
		return false
	}
	if r.Status == "success" {
		return r.Error == nil
	}
	return r.Error != nil && r.Error.Code != "" && r.Error.Message != ""
}

// Common error codes
const (
	ErrCodeInvalidRequest   = "INVALID_REQUEST"
	ErrCodeNotFound         = "NOT_FOUND"
	ErrCodeSongNotFound     = "SONG_NOT_FOUND"
	ErrCodeAlbumNotFound    = "ALBUM_NOT_FOUND"
	ErrCodeArtistNotFound   = "ARTIST_NOT_FOUND"
	ErrCodePlaylistNotFound = "PLAYLIST_NOT_FOUND"
	ErrCodeInternalError    = "INTERNAL_ERROR"
	ErrCodeUnavailable      = "SERVICE_UNAVAILABLE"
	ErrCodeUnauthorized     = "UNAUTHORIZED"
)
