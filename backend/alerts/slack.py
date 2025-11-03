import os
import json
import requests

def send_alert(text: str, blocks=None):
    url = os.environ.get("SLACK_WEBHOOK_URL")
    if not url:
        print("Slack alert failed: SLACK_WEBHOOK_URL not set.")
        return
    payload = {"text": text}
    if blocks:
        payload["blocks"] = blocks
    try:
        resp = requests.post(url, data=json.dumps(payload), headers={"Content-Type":"application/json"}, timeout=7)
        resp.raise_for_status()
        print(f"[Slack] Alert sent: {text}")
    except Exception as e:
        print(f"Slack alert error: {e}")
