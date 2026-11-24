package controller

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5/pgconn"
)

func TestWriteUseInstanceError(t *testing.T) {
	tests := []struct {
		name       string
		err        error
		wantStatus int
		wantBody   string
	}{
		{
			"missing instance",
			&pgconn.PgError{Code: "P0002"},
			http.StatusNotFound,
			"instance not found",
		},
		{
			"grams exceed inventory",
			&pgconn.PgError{Code: "23514", Detail: "grams"},
			http.StatusBadRequest,
			"grams exceeds remaining inventory",
		},
		{
			"unexpected constraint failure",
			&pgconn.PgError{Code: "23514", Detail: "other"},
			http.StatusInternalServerError,
			"could not use instance",
		},
		{
			"invalid database type",
			&pgconn.PgError{Code: "22P02"},
			http.StatusInternalServerError,
			"could not use instance",
		},
		{
			"database not null failure",
			&pgconn.PgError{Code: "23502"},
			http.StatusInternalServerError,
			"could not use instance",
		},
		{
			"unexpected database failure",
			errors.New("internal database failure"),
			http.StatusInternalServerError,
			"could not use instance",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rec := httptest.NewRecorder()
			writeUseInstanceError(rec, tt.err)

			if rec.Code != tt.wantStatus {
				t.Errorf("status = %d, want %d", rec.Code, tt.wantStatus)
			}
			if !strings.Contains(rec.Body.String(), tt.wantBody) {
				t.Errorf("body = %q, want %q", rec.Body.String(), tt.wantBody)
			}
		})
	}
}
