import json
from pathlib import Path
import pandas as pd

repo_root = Path(__file__).resolve().parents[2]
output_path = repo_root / "src/features/swim-resources/lib/data/raw-standards.json"
df = pd.read_csv(output_path.parent / "Athletes & Standards - Standards.csv")
standards = []

clean_val = lambda x: None if pd.isna(x) or str(x).strip() in ["-", ""] else str(x).strip()
clean_age = lambda x: int(float(x)) if clean_val(x) is not None else None

for col in df.columns[1:]:
    val = df[col]
    standards.append({
        "isStandard": "TRUE" in col,
        "cut": clean_val(val[0]),
        "gender": clean_val(val[1]),
        "minAge": clean_age(val[2]),
        "maxAge": clean_age(val[3]),
        "eligibleStart": clean_val(val[4]),
        "eligibleEnd": clean_val(val[5]),
        "times": {
            df.iloc[i, 0]: str(val[i]).strip()
            for i in range(7, len(df))
            if clean_val(val[i]) is not None
        }
    })

with output_path.open("w", encoding="utf-8") as f:
    json.dump(standards, f, indent=2)

print(f"Exported {len(standards)} standards to {output_path}.")
