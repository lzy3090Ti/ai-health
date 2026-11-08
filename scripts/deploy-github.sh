#!/usr/bin/env bash
# 一键把当前仓库发布到 GitHub Pages（需要具有 repo + workflow 权限的 Classic PAT）
#
#   用法：
#     GH_TOKEN=ghp_xxx ./scripts/deploy-github.sh [仓库名]
#
#   默认仓库名 ai-health；仓库不存在则自动创建（公开），已存在则直接推送。
#   令牌只存在于环境变量与单次 push 的 URL 中，不会写入 .git/config。
set -euo pipefail

TOKEN="${GH_TOKEN:-}"
REPO="${1:-ai-health}"
PROXY="${HTTPS_PROXY:-http://127.0.0.1:7890}"

if [[ -z "$TOKEN" ]]; then
  echo "缺少 GH_TOKEN。请先在 GitHub 生成 Classic PAT（勾选 repo + workflow）后重试。" >&2
  exit 1
fi

api() { # api METHOD PATH [BODY]
  local method="$1" path="$2" body="${3:-}"
  if [[ -n "$body" ]]; then
    curl -sS -m 40 -x "$PROXY" -X "$method" "https://api.github.com$path" \
      -H "Authorization: Bearer $TOKEN" \
      -H "Accept: application/vnd.github+json" \
      -H "X-GitHub-Api-Version: 2022-11-28" \
      -H "Content-Type: application/json" \
      -d "$body"
  else
    curl -sS -m 40 -x "$PROXY" -X "$method" "https://api.github.com$path" \
      -H "Authorization: Bearer $TOKEN" \
      -H "Accept: application/vnd.github+json" \
      -H "X-GitHub-Api-Version: 2022-11-28"
  fi
}

echo "▸ 校验令牌…"
LOGIN=$(api GET /user | python3 -c 'import sys,json;print(json.load(sys.stdin).get("login",""))')
[[ -n "$LOGIN" ]] || { echo "令牌无效或已过期。" >&2; exit 1; }
echo "  已登录：$LOGIN"

echo "▸ 检查仓库 $LOGIN/$REPO …"
CODE=$(curl -sS -m 30 -o /dev/null -w '%{http_code}' -x "$PROXY" \
  -H "Authorization: Bearer $TOKEN" "https://api.github.com/repos/$LOGIN/$REPO")
if [[ "$CODE" == "404" ]]; then
  echo "  不存在，创建公开仓库…"
  api POST /user/repos "{\"name\":\"$REPO\",\"description\":\"Ai·健康 — 个人健康评分与行动建议（React 19 + Capacitor 双端）\",\"private\":false,\"has_issues\":true,\"has_wiki\":false}" >/dev/null
  sleep 2
elif [[ "$CODE" != "200" ]]; then
  echo "  无法访问仓库（HTTP $CODE）" >&2; exit 1
else
  echo "  已存在，直接推送"
fi

echo "▸ 推送 main 分支…"
git remote remove origin 2>/dev/null || true
git remote add origin "https://github.com/$LOGIN/$REPO.git"
git -c http.proxy="$PROXY" push "https://x-access-token:$TOKEN@github.com/$LOGIN/$REPO.git" main:main --force

echo "▸ 启用 GitHub Pages（构建源：GitHub Actions）…"
PAGES_BODY='{"build_type":"workflow"}'
api POST "/repos/$LOGIN/$REPO/pages" "$PAGES_BODY" >/dev/null 2>&1 || \
  api PUT "/repos/$LOGIN/$REPO/pages" "$PAGES_BODY" >/dev/null 2>&1 || true

echo "▸ 等待首次构建（最长约 5 分钟）…"
for i in $(seq 1 60); do
  # 注意：这里用 python3 -c 而不是 heredoc，heredoc 会抢占 stdin、把上面的管道写断
  STATUS=$(api GET "/repos/$LOGIN/$REPO/actions/runs?per_page=1" | python3 -c '
import sys, json
try:
    d = json.load(sys.stdin)
    runs = d.get("workflow_runs") or []
    if not runs:
        print("none||")
    else:
        r = runs[0]
        print("%s|%s|%s" % (r.get("status"), r.get("conclusion") or "", r.get("html_url")))
except Exception:
    print("parse||")
')
  IFS='|' read -r ST CON URL <<< "$STATUS"
  echo "  [$i] status=$ST conclusion=${CON:-—}"
  if [[ "$ST" == "completed" ]]; then
    if [[ "$CON" == "success" ]]; then break; fi
    echo "构建失败，日志：$URL" >&2; exit 1
  fi
  sleep 5
done

SITE="https://$(echo "$LOGIN" | tr '[:upper:]' '[:lower:]').github.io/$REPO/"
echo "▸ 探测站点可用性…"
for i in $(seq 1 20); do
  C=$(curl -sS -m 20 -o /dev/null -w '%{http_code}' -x "$PROXY" "$SITE" || true)
  [[ "$C" == "200" ]] && break
  sleep 5
done
echo
echo "✅ 完成"
echo "   仓库：https://github.com/$LOGIN/$REPO"
echo "   站点：$SITE （HTTP $C）"
