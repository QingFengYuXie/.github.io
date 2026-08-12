import json
import os
import re
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime
from email.utils import format_datetime
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
REPOSITORY = os.environ.get("GITHUB_REPOSITORY", "QingFengYuXie/.github.io")
TOKEN = os.environ.get("GITHUB_TOKEN", "")
SITE_URL = "https://qfyx.top/"


def github_get(url, accept="application/vnd.github+json"):
    headers = {
        "Accept": accept,
        "User-Agent": "lightwind-os-blog-sync",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    if TOKEN:
        headers["Authorization"] = f"Bearer {TOKEN}"
    request = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.load(response)


def clean_description(markdown):
    text = re.sub(r"```.*?```", " ", markdown or "", flags=re.S)
    text = re.sub(r"!?\[([^]]*)\]\([^)]+\)", r"\1", text)
    text = re.sub(r"[#>*_`~|\-]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()[:220]


def to_rfc2822(value):
    return format_datetime(datetime.fromisoformat(value.replace("Z", "+00:00")))


def normalize(issue):
    return {
        "id": f"issue-{issue['number']}",
        "number": issue["number"],
        "title": issue["title"],
        "body": issue.get("body") or "*这篇文章暂时没有正文。*",
        "bodyHtml": issue.get("body_html") or "",
        "date": issue["created_at"][:10],
        "updated": issue["updated_at"][:10],
        "comments": issue.get("comments", 0),
        "labels": [label["name"] for label in issue.get("labels", [])],
        "sourceUrl": issue["html_url"],
        "author": issue.get("user", {}).get("login", "QingFengYuXie"),
        "createdAt": issue["created_at"],
    }


def build_feed(posts):
    rss = ET.Element("rss", version="2.0")
    channel = ET.SubElement(rss, "channel")
    ET.SubElement(channel, "title").text = "轻风雨斜 OS"
    ET.SubElement(channel, "link").text = f"{SITE_URL}?page=2"
    ET.SubElement(channel, "description").text = "把想法写下来，把生活编译成自己的系统。"
    ET.SubElement(channel, "language").text = "zh-CN"
    if posts:
        ET.SubElement(channel, "lastBuildDate").text = to_rfc2822(posts[0]["createdAt"])
    for post in posts:
        url = f"{SITE_URL}?page=2&post={post['id']}"
        item = ET.SubElement(channel, "item")
        ET.SubElement(item, "title").text = post["title"]
        ET.SubElement(item, "link").text = url
        ET.SubElement(item, "guid").text = url
        ET.SubElement(item, "pubDate").text = to_rfc2822(post["createdAt"])
        ET.SubElement(item, "description").text = clean_description(post["body"])
        for label in post["labels"]:
            ET.SubElement(item, "category").text = label
    ET.indent(rss, space="  ")
    ET.ElementTree(rss).write(ROOT / "feed.xml", encoding="utf-8", xml_declaration=True)


def main():
    issues = github_get(
        f"https://api.github.com/repos/{REPOSITORY}/issues?state=open&per_page=100&sort=created&direction=desc",
        "application/vnd.github.full+json",
    )
    posts = [normalize(issue) for issue in issues if "pull_request" not in issue and issue.get("labels")]
    posts.sort(key=lambda post: post["createdAt"], reverse=True)
    posts.sort(key=lambda post: not any(label.lower() in {"置顶", "pinned"} for label in post["labels"]))
    public_posts = [{key: value for key, value in post.items() if key != "createdAt"} for post in posts]
    (ROOT / "blog-data.json").write_text(json.dumps(public_posts, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    build_feed(posts)
    print(f"Synced {len(posts)} issue-backed blog posts from {REPOSITORY}")


if __name__ == "__main__":
    main()
