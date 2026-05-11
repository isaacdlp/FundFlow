import json

def get_keys(d, prefix=''):
    keys = set()
    for k, v in d.items():
        full_key = f"{prefix}.{k}" if prefix else k
        if isinstance(v, dict):
            keys.update(get_keys(v, full_key))
        else:
            keys.add(full_key)
    return keys

with open('client/src/i18n/locales/en.json', 'r') as f:
    en_keys = get_keys(json.load(f))

with open('real_used_keys.txt', 'r') as f:
    used_keys = [line.strip() for line in f if line.strip()]

missing = []
for key in used_keys:
    if key not in en_keys:
        missing.append(key)

if missing:
    print("MISSING KEYS:")
    for m in missing:
        print(m)
else:
    print("ALL KEYS PRESENT")
