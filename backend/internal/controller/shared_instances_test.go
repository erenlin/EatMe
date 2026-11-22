package controller

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"eatme/internal/auth"
	"eatme/internal/config"
	"eatme/internal/store"
)

const sharedTestSecret = "shared-inventory-unit-test-secret"

type fakeSharedReader struct {
	instances []store.SharedInstance
	err       error
	calls     int
	userID    int
}

func (f *fakeSharedReader) GetSharedInstances(
	_ context.Context,
	userID int,
) ([]store.SharedInstance, error) {
	f.calls++
	f.userID = userID
	return f.instances, f.err
}

func sharedTestHandler(reader *fakeSharedReader) http.Handler {
	shared := NewSharedInstancesController(reader)
	authController := &AuthController{
		cfg: config.Config{JWTSecret: sharedTestSecret},
	}
	return authController.RequireAuth(shared.Shared)
}

func sharedTestRequest(handler http.Handler, token, path string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodGet, path, nil)
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	return rec
}

func sharedTestToken(t *testing.T, secret string, userID int) string {
	t.Helper()
	token, err := auth.IssueToken([]byte(secret), userID, "test@example.invalid")
	if err != nil {
		t.Fatal(err)
	}
	return token
}

func TestSharedRejectsMissingToken(t *testing.T) {
	reader := &fakeSharedReader{}
	rec := sharedTestRequest(sharedTestHandler(reader), "", "/instances/shared")

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", rec.Code)
	}
	if reader.calls != 0 {
		t.Fatal("database was called without authentication")
	}
}

func TestSharedRejectsInvalidSignature(t *testing.T) {
	reader := &fakeSharedReader{}
	token := sharedTestToken(t, "wrong-secret", 21)
	rec := sharedTestRequest(sharedTestHandler(reader), token, "/instances/shared")

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", rec.Code)
	}
	if reader.calls != 0 {
		t.Fatal("database was called for an invalid token")
	}
}

func TestSharedUsesAuthenticatedUserID(t *testing.T) {
	reader := &fakeSharedReader{
		instances: []store.SharedInstance{
			{
				Instance: store.Instance{
					InstanceID:  90,
					UserID:      6,
					ItemName:    "Kiwi",
					VariantName: "Organic",
				},
				OwnerName: "Test Owner",
			},
		},
	}

	token := sharedTestToken(t, sharedTestSecret, 21)
	rec := sharedTestRequest(
		sharedTestHandler(reader),
		token,
		"/instances/shared?user_id=999",
	)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	if reader.calls != 1 || reader.userID != 21 {
		t.Fatalf("expected lookup for user 21, got calls=%d user=%d",
			reader.calls, reader.userID)
	}

	var rows []store.SharedInstance
	if err := json.Unmarshal(rec.Body.Bytes(), &rows); err != nil {
		t.Fatal(err)
	}
	if len(rows) != 1 || rows[0].OwnerName != "Test Owner" ||
		rows[0].UserID != 6 {
		t.Fatalf("unexpected response: %+v", rows)
	}
}

func TestSharedEmptyInventory(t *testing.T) {
	reader := &fakeSharedReader{
		instances: []store.SharedInstance{},
	}
	token := sharedTestToken(t, sharedTestSecret, 21)
	rec := sharedTestRequest(sharedTestHandler(reader), token, "/instances/shared")

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	if strings.TrimSpace(rec.Body.String()) != "[]" {
		t.Fatalf("expected empty JSON array, got %q", rec.Body.String())
	}
}

func TestSharedHidesDatabaseErrors(t *testing.T) {
	reader := &fakeSharedReader{
		err: errors.New("sensitive database details"),
	}
	token := sharedTestToken(t, sharedTestSecret, 21)
	rec := sharedTestRequest(sharedTestHandler(reader), token, "/instances/shared")

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d", rec.Code)
	}
	if strings.Contains(rec.Body.String(), "sensitive database details") {
		t.Fatal("database error details leaked to the client")
	}
}
