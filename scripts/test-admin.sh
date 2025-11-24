#!/bin/bash

API_URL="http://localhost:3000"
ADMIN_KEY="${ADMIN_API_KEY}"

if [ -z "$ADMIN_KEY" ]; then
  echo "Error: ต้องตั้งค่า ADMIN_API_KEY environment variable"
  exit 1
fi

echo "🔍 Testing Admin Dashboard API"
echo "================================"
echo ""

echo "📊 1. Dashboard Stats"
curl -s -X GET "$API_URL/admin/stats" \
  -H "Authorization: Bearer $ADMIN_KEY" | jq '.'
echo ""
echo ""

echo "🎫 2. All Licenses (page 1)"
curl -s -X GET "$API_URL/admin/licenses?page=1&limit=5" \
  -H "Authorization: Bearer $ADMIN_KEY" | jq '.'
echo ""
echo ""

echo "💻 3. All Devices (page 1)"
curl -s -X GET "$API_URL/admin/devices?page=1&limit=5" \
  -H "Authorization: Bearer $ADMIN_KEY" | jq '.'
echo ""
echo ""

echo "📋 4. Recent Logs"
curl -s -X GET "$API_URL/admin/logs?page=1&limit=10" \
  -H "Authorization: Bearer $ADMIN_KEY" | jq '.'
echo ""
echo ""

echo "✅ Test completed!"

