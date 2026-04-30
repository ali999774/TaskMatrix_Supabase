import json, sys

path = "/Users/ali/.openclaw/openclaw.json"

with open(path, "r") as f:
    data = json.load(f)

ids_to_remove = {"gemma4", "qwen3.5:4b", "google/gemini-3-flash"}
removed = []

def remove_from_list(lst):
    if not isinstance(lst, list):
        return lst
    filtered = [item for item in lst if not (isinstance(item, dict) and item.get("id") in ids_to_remove)]
    removed.extend([item["id"] for item in lst if isinstance(item, dict) and item.get("id") in ids_to_remove])
    return filtered

# Walk the JSON looking for any list containing these model entries
def fix(obj):
    if isinstance(obj, list):
        return remove_from_list([fix(i) for i in obj])
    elif isinstance(obj, dict):
        return {k: fix(v) for k, v in obj.items()}
    return obj

fixed = fix(data)

with open(path, "w") as f:
    json.dump(fixed, f, indent=2)

print(f"Done. Removed: {removed if removed else 'nothing matched — check IDs'}")
