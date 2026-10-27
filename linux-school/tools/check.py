"""Проверка файлов курса: python3 tools/check.py. Ничего не меняет, только сообщает об ошибках."""
import json, os, re, sys
root = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "courses", "linux")
idx = json.load(open(os.path.join(root, "course.json"), encoding="utf-8"))
errs, ids = [], set()
def bad(m): errs.append(m)
for l in idx["layers"]:
    data = json.load(open(os.path.join(root, l["file"]), encoding="utf-8"))
    for t in data["topics"]:
        if not t.get("read"): bad(f"{t['id']}: нет конспекта")
        for s in t.get("src", []):
            if s not in idx["sources"]: bad(f"{t['id']}: неизвестный источник {s}")
        for it in t["items"]:
            i = it.get("id", "?")
            if i in ids: bad(f"{i}: повтор id")
            ids.add(i)
            ty = it["type"]
            if ty in ("choice", "output"):
                if not (0 <= it["a"] < len(it["opts"])): bad(f"{i}: ответ вне списка")
                if len(it["opts"]) < 3: bad(f"{i}: меньше трёх вариантов")
            elif ty == "assemble":
                tk = list(it["tokens"])
                for a in it["answer"]:
                    if a in tk: tk.remove(a)
                    else: bad(f"{i}: в ответе есть то, чего нет среди слов: {a}")
            elif ty == "case":
                for s in it["steps"]:
                    if not (0 <= s["a"] < len(s["opts"])): bad(f"{i}: ответ вне списка в шаге")
            elif ty == "lab":
                for k in it["tasks"]:
                    if "re" in k:
                        try: re.compile(k["re"])
                        except re.error as e: bad(f"{i}: плохое выражение {k['re']}: {e}")
            elif ty in ("flip", "explain", "tour"): pass
            else: bad(f"{i}: неизвестный тип {ty}")
print("ошибок:", len(errs)); [print(" -", e) for e in errs]
print("заданий:", len(ids))
sys.exit(1 if errs else 0)
