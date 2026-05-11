import json
import sys

def get_nested_val(d, key):
    parts = key.split('.')
    curr = d
    for p in parts:
        if isinstance(curr, dict) and p in curr:
            curr = curr[p]
        else:
            return None
    return curr

with open('client/src/i18n/locales/en.json', 'r') as f:
    en = json.load(f)

with open('all_referenced_keys.txt', 'r') as f:
    referenced = [line.strip() for line in f if line.strip()]

missing = []
for key in referenced:
    # 1. Direct check
    val = get_nested_val(en, key)
    if val is not None:
        continue
    
    # 2. Plural check (if key is 'count', check for _one/_other)
    # This is a bit simplified, usually t('key', {count: 1}) looks for key_one
    val_one = get_nested_val(en, f"{key}_one")
    val_other = get_nested_val(en, f"{key}_other")
    if val_one is not None or val_other is not None:
        continue
        
    missing.append(key)

if missing:
    print("\n".join(missing))
