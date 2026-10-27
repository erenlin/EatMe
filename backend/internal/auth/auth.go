package auth

import (
	"errors"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// TokenTTL is how long an issued token stays valid.
const TokenTTL = 23 * time.Hour

// Claims are the JWT claims: username plus standard expiry.
type Claims struct {
	Username string `json:"username"`
	jwt.RegisteredClaims
}

// IssueToken returns a signed JWT holding the username that expires in 23 hours.
func IssueToken(secret []byte, username string) (string, error) {
	claims := Claims{
		Username: username,
		RegisteredClaims: jwt.RegisteredClaims{
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(TokenTTL)),
		},
	}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(secret)
}

// ParseToken validates the token and returns the username.
func ParseToken(secret []byte, tokenStr string) (string, error) {
	var claims Claims
	tok, err := jwt.ParseWithClaims(tokenStr, &claims,
		func(*jwt.Token) (any, error) { return secret, nil },
		jwt.WithValidMethods([]string{"HS256"}),
		jwt.WithExpirationRequired(),
	)
	if err != nil {
		return "", err
	}
	if !tok.Valid || claims.Username == "" {
		return "", errors.New("invalid token")
	}
	return claims.Username, nil
}
