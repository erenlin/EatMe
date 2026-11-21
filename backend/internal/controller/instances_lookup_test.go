package controller

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"eatme/internal/config"
	"eatme/internal/store"
)

type fakeLookupReader struct {
	instances []store.LookupInstance
	err       error
	calls     int
	userID    int
}

func (f *fakeLookupReader) LookupInstances(
	_ context.Context,
	userID int,
	_ string,
	_ bool,
	_ *int,
	_ bool,
) ([]store.LookupInstance, error) {
	f.calls++
	f.userID = userID
	return f.instances, f.err
}

func lookupTestHandler(reader *fakeLookupReader) http.Handler {
	controller := &InstanceController{
		lookupReader: reader,
	}

	authController := &AuthController{
		cfg: config.Config{JWTSecret: sharedTestSecret},
	}

	return authController.RequireAuth(controller.Lookup)
}

func TestLookupRejectsMissingToken(t *testing.T) {
	reader := &fakeLookupReader{}
	handler := lookupTestHandler(reader)

	req := httptest.NewRequest(
		http.MethodGet,
		"/instances/lookup",
		nil,
	)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", rec.Code)
	}

	if reader.calls != 0 {
		t.Fatal("database was called without authentication")
	}
}

func TestLookupRejectsInvalidParameters(t *testing.T) {
	tests := []struct {
		name string
		path string
	}{
		{"invalid shared", "/instances/lookup?shared=abc"},
		{"invalid variant ID", "/instances/lookup?variant_id=abc"},
		{"zero variant ID", "/instances/lookup?variant_id=0"},
		{"invalid include_expired", "/instances/lookup?include_expired=abc"},
		{"duplicate shared", "/instances/lookup?shared=true&shared=false"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			reader := &fakeLookupReader{}
			handler := lookupTestHandler(reader)

			token := sharedTestToken(t, sharedTestSecret, 21)
			req := httptest.NewRequest(http.MethodGet, tt.path, nil)
			req.Header.Set("Authorization", "Bearer "+token)

			rec := httptest.NewRecorder()
			handler.ServeHTTP(rec, req)

			if rec.Code != http.StatusBadRequest {
				t.Fatalf(
					"expected 400, got %d: %s",
					rec.Code,
					rec.Body.String(),
				)
			}

			if reader.calls != 0 {
				t.Fatal("database was called with invalid parameters")
			}
		})
	}
}
