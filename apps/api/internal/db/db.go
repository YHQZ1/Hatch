package db

import (
	"database/sql"
	"log"

	_ "github.com/lib/pq"
)

func Connect(databaseURL string) *sql.DB {
	db, err := sql.Open("postgres", databaseURL)
	if err != nil {
		log.Fatalf("db open failed: %v", err)
	}

	if err := db.Ping(); err != nil {
		log.Fatalf("db ping failed: %v", err)
	}

	return db
}
