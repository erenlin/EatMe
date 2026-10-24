package domain

// User is the core user entity for authentication and profile information.
type User struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	Email string `json:"email"`
}
