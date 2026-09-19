#!/usr/bin/env bash
# Publica issues/epic-*.md y issues/sub-[abc]-*.md como GitHub Issues,
# reescribe las referencias #<id> a números reales y añade cada issue al
# GitHub Project con su Priority. Idempotente: reutiliza issues por título.
#
# Uso: bash prompts/scripts/publish-epics.sh [--dry-run]
# Requiere: gh (scopes repo + project), python3.
set -euo pipefail

REPO="${REPO:-ronnycoding/desarrollo-de-software-con-ia}"
OWNER="${OWNER:-ronnycoding}"
PROJECT="${PROJECT:-8}"
ISSUES_DIR="${ISSUES_DIR:-issues}"
DRY_RUN=0
[[ "${1:-}" == "--dry-run" ]] && DRY_RUN=1

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

run() { if (( DRY_RUN )); then echo "[dry-run] $*"; else "$@"; fi; }

# --- helpers -----------------------------------------------------------------
# fm <file> <key>  -> valor escalar del front matter (sin comillas)
fm() {
  python3 - "$1" "$2" <<'PY'
import re, sys
text = open(sys.argv[1], encoding="utf-8").read()
m = re.match(r"^---\n(.*?)\n---\n", text, re.S)
fmt = m.group(1) if m else ""
for line in fmt.splitlines():
    k, _, v = line.partition(":")
    if k.strip() == sys.argv[2]:
        print(v.strip().strip('"').strip("'"))
        break
PY
}
# fm_list <file> <key> -> elementos de una lista YAML inline, uno por línea
fm_list() {
  python3 - "$1" "$2" <<'PY'
import re, sys
text = open(sys.argv[1], encoding="utf-8").read()
m = re.match(r"^---\n(.*?)\n---\n", text, re.S)
fmt = m.group(1) if m else ""
for line in fmt.splitlines():
    k, _, v = line.partition(":")
    if k.strip() == sys.argv[2]:
        for item in re.findall(r'"([^"]*)"|\'([^\']*)\'', v):
            print(item[0] or item[1])
        break
PY
}
# body <file> -> cuerpo sin front matter
body() {
  python3 - "$1" <<'PY'
import re, sys
text = open(sys.argv[1], encoding="utf-8").read()
print(re.sub(r"^---\n.*?\n---\n", "", text, count=1, flags=re.S), end="")
PY
}

# --- 1. labels ---------------------------------------------------------------
echo "==> Labels"
while IFS='|' read -r name color desc; do
  run gh label create "$name" --repo "$REPO" --color "$color" --description "$desc" --force >/dev/null
done <<'LABELS'
epic|5319e7|Epic con sub-issues
sub-issue|0e8a16|Sub-issue de un epic
P0|b60205|Prioridad máxima
P1|d93f0b|Prioridad alta
P2|fbca04|Prioridad media
backend|1d76db|Backend / API
frontend|c5def5|UI / cliente
database|006b75|Esquema y datos
testing|bfd4f2|Tests
chatbot|f9d0c4|Chatbot DeepSeek
feature|a2eeef|Nueva funcionalidad
bdd|f0e1ff|Behavior-Driven Development
user-story|d4c5f9|User story BDD
manual-testing|e99695|Pruebas manuales
LABELS
# story-points:N se crean bajo demanda
for n in 1 2 3 5 8 13 21; do
  run gh label create "story-points:$n" --repo "$REPO" --color ededed --description "Story points" --force >/dev/null
done

# --- 2. pass 1: crear (o reutilizar) issues ----------------------------------
echo "==> Issues (pass 1: crear)"
FILES=( "$ISSUES_DIR"/epic-*.md "$ISSUES_DIR"/sub-[abc]-*.md )
: > "$TMP/map"   # id<TAB>number<TAB>url<TAB>file

existing_number() {  # por título exacto (open o closed)
  gh issue list --repo "$REPO" --state all --limit 200 --json number,title \
    --jq --arg t "$1" '.[] | select(.title == $t) | .number' | head -n1
}

for f in "${FILES[@]}"; do
  id="$(fm "$f" id)"; title="$(fm "$f" title)"
  [[ -n "$id" && -n "$title" ]] || { echo "  !! $f sin id/title en front matter"; exit 1; }
  labels="$(fm_list "$f" labels | paste -sd, -)"
  num="$(existing_number "$title" || true)"
  if [[ -n "$num" ]]; then
    echo "  = #$num  $title (existente)"
  else
    body "$f" > "$TMP/$id.body.md"
    if (( DRY_RUN )); then
      echo "  + [dry-run] $title  labels=$labels"; num="DRY-$id"
    else
      url="$(gh issue create --repo "$REPO" --title "$title" --label "$labels" --body-file "$TMP/$id.body.md")"
      num="${url##*/}"
      echo "  + #$num  $title"
    fi
  fi
  printf '%s\t%s\t%s\t%s\n' "$id" "$num" "https://github.com/$REPO/issues/$num" "$f" >> "$TMP/map"
done

# --- 3. pass 2: reescribir referencias #<id> -> #<n> ------------------------
echo "==> Issues (pass 2: referencias)"
while IFS=$'\t' read -r id num url f; do
  body "$f" > "$TMP/$id.raw.md"
  python3 - "$TMP/map" "$TMP/$id.raw.md" "$TMP/$id.final.md" <<'PY'
import re, sys
mp = {}
for line in open(sys.argv[1], encoding="utf-8"):
    i, n, *_ = line.rstrip("\n").split("\t")
    mp[i] = n
text = open(sys.argv[2], encoding="utf-8").read()
# ids más largos primero para que #A-01 no pise #A-010 (no existe, pero por seguridad)
for i in sorted(mp, key=len, reverse=True):
    text = re.sub(r"#" + re.escape(i) + r"(?![\w-])", "#" + mp[i], text)
open(sys.argv[3], "w", encoding="utf-8").write(text)
PY
  if grep -qE '#(EPIC-[ABC]|[ABC]-0[0-9])\b' "$TMP/$id.final.md"; then
    echo "  !! $id: quedan referencias sin resolver"; grep -noE '#(EPIC-[ABC]|[ABC]-0[0-9])\b' "$TMP/$id.final.md" | head
  fi
  run gh issue edit "$num" --repo "$REPO" --body-file "$TMP/$id.final.md" >/dev/null
  echo "  ~ #$num  $id"
done < "$TMP/map"
echo "  (las referencias #PARENT, #01-01 y #01-02 se dejan tal cual: esos issues los crean las demos 1 y 2)"

# --- 4. project: añadir + Priority -------------------------------------------
echo "==> Project #$PROJECT"
PROJECT_ID="$(gh project view "$PROJECT" --owner "$OWNER" --format json --jq .id)"
FIELD_JSON="$(gh project field-list "$PROJECT" --owner "$OWNER" --format json)"
PRIORITY_FIELD_ID="$(printf '%s' "$FIELD_JSON" | python3 -c 'import json,sys; print(next(f["id"] for f in json.load(sys.stdin)["fields"] if f["name"]=="Priority"))')"
opt_id() {  # opt_id P0
  printf '%s' "$FIELD_JSON" | python3 -c 'import json,sys; f=next(f for f in json.load(sys.stdin)["fields"] if f["name"]=="Priority"); print(next(o["id"] for o in f["options"] if o["name"]==sys.argv[1]))' "$1"
}

while IFS=$'\t' read -r id num url f; do
  prio="$(fm "$f" priority)"
  if (( DRY_RUN )); then echo "  [dry-run] add $url priority=$prio"; continue; fi
  item_id="$(gh project item-add "$PROJECT" --owner "$OWNER" --url "$url" --format json --jq .id)"
  if [[ -n "$prio" ]]; then
    gh project item-edit --project-id "$PROJECT_ID" --id "$item_id" \
      --field-id "$PRIORITY_FIELD_ID" --single-select-option-id "$(opt_id "$prio")" >/dev/null
  fi
  echo "  ▸ #$num  $id  priority=$prio"
done < "$TMP/map"

echo
echo "Listo. Board: https://github.com/users/$OWNER/projects/$PROJECT"
echo "Mapa id → número:"; awk -F'\t' '{ printf "  %-8s #%s\n", $1, $2 }' "$TMP/map"
