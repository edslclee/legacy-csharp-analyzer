#!/usr/bin/env bash
set -euo pipefail

BASE_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SAMPLES="$BASE_DIR/samples"

mkdir -p "$SAMPLES/src" "$SAMPLES/sql"

# C# 샘플
cat > "$SAMPLES/src/User.cs" <<'CS'
namespace Demo {
  public class User {
    public int Id { get; set; }
    public string Name { get; set; }
  }
}
CS

# SQL 샘플
cat > "$SAMPLES/sql/schema.sql" <<'SQL'
CREATE TABLE Users (
  Id INT PRIMARY KEY,
  Name VARCHAR(100) NOT NULL
);

CREATE TABLE Orders (
  Id INT PRIMARY KEY,
  UserId INT,
  FOREIGN KEY (UserId) REFERENCES Users(Id)
);
SQL

# 문서 샘플
echo "Users can be created and edited..." > "$SAMPLES/manual.txt"

# ZIP 묶기
(cd "$SAMPLES" && zip -r project.zip src sql manual.txt >/dev/null)

echo "✅ 샘플 생성 완료: $SAMPLES"
ls -lh "$SAMPLES"