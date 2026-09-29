"""
POC : recherche unifiée sur la documentation (GitHub + dossiers locaux)

Installation (à faire AVANT la démo, une première exécution télécharge le modèle d'embeddings) :
    pip install streamlit chromadb pypdf
Lancement :
    streamlit run app.py

Optionnel (réponse rédigée par un LLM local) :
    installer Ollama puis : ollama pull mistral
"""
import json
import pathlib
import subprocess
import urllib.request

import chromadb
import streamlit as st
from pypdf import PdfReader

# ---------- CONFIG ----------
GITHUB_USER = "ArthurMillet44"          # <- à modifier
LOCAL_FOLDERS = ["./docs_locales"]          # <- 1 ou 2 dossiers
CACHE = pathlib.Path("./cache_github")
EXTS = {".md", ".txt", ".rst", ".pdf"}
OLLAMA_MODEL = "mistral"
SEUIL = 0.45   # distance max (cosinus) ; au-delà : "je n'ai pas l'info". À ajuster.
# ----------------------------

client = chromadb.PersistentClient(path="./index")
col = client.get_or_create_collection("docs", metadata={"hnsw:space": "cosine"})


def run(cmd, cwd=None):
    return subprocess.run(cmd, cwd=cwd, capture_output=True, text=True)


def sync_github():
    """Clone (ou met à jour) tous les repos publics + leur wiki s'il existe."""
    CACHE.mkdir(exist_ok=True)
    url = f"https://api.github.com/users/{GITHUB_USER}/repos?per_page=100"
    repos = json.load(urllib.request.urlopen(url))
    for r in repos:
        if r.get("fork"):
            continue
        for suffix, clone_url in [("", r["clone_url"]),
                                  (".wiki", r["clone_url"].replace(".git", ".wiki.git"))]:
            dest = CACHE / (r["name"] + suffix)
            if dest.exists():
                run(["git", "pull", "--quiet"], cwd=dest)
            else:
                run(["git", "clone", "--depth", "1", "--quiet", clone_url, str(dest)])


def read_file(path):
    if path.suffix.lower() == ".pdf":
        return "\n".join((p.extract_text() or "") for p in PdfReader(str(path)).pages)
    return path.read_text(encoding="utf-8", errors="ignore")


def chunks(text, size=800, overlap=150):
    text = " ".join(text.split())
    for i in range(0, len(text), size - overlap):
        piece = text[i:i + size]
        if len(piece) > 100:
            yield piece


def collect():
    """Retourne (origine, chemin) pour tous les fichiers à indexer."""
    sources = [("Local", pathlib.Path(p)) for p in LOCAL_FOLDERS]
    if CACHE.exists():
        sources += [("GitHub", d) for d in CACHE.iterdir() if d.is_dir()]
    for origin, root in sources:
        for f in root.rglob("*"):
            if f.is_file() and f.suffix.lower() in EXTS and ".git" not in f.parts:
                yield origin, f


def index_all(with_github=True, progress_cb=None):
    """progress_cb(fraction: float, label: str) est appelé pour refléter l'avancement."""
    def report(fraction, label):
        if progress_cb:
            progress_cb(min(fraction, 1.0), label)

    if with_github:
        report(0.0, "Synchronisation des dépôts GitHub...")
        sync_github()
    client.delete_collection("docs")
    global col
    col = client.get_or_create_collection("docs", metadata={"hnsw:space": "cosine"})

    files = list(collect())
    ids, docs, metas = [], [], []
    for i, (origin, f) in enumerate(files):
        report(0.1 + 0.6 * (i / len(files) if files else 1), f"Lecture : {f.name}")
        try:
            text = read_file(f)
        except Exception:
            continue
        for n, c in enumerate(chunks(text)):
            ids.append(f"{origin}:{f}:{n}")
            docs.append(c)
            metas.append({"origin": origin, "source": str(f)})

    report(0.7, "Génération des embeddings...")
    for i in range(0, len(ids), 500):
        col.add(ids=ids[i:i+500], documents=docs[i:i+500], metadatas=metas[i:i+500])
        report(0.7 + 0.3 * (i / len(ids) if ids else 1), "Indexation dans ChromaDB...")

    report(1.0, "Terminé")
    return len(ids)


def ask_llm(question, passages):
    context = "\n\n".join(f"[{i+1}] {p}" for i, p in enumerate(passages))
    prompt = ("Réponds en français à la question en t'appuyant UNIQUEMENT sur les extraits. "
              "Cite les numéros [n]. Si l'info n'y est pas, dis-le.\n\n"
              f"Extraits :\n{context}\n\nQuestion : {question}\nRéponse :")
    req = urllib.request.Request(
        "http://localhost:11434/api/generate",
        data=json.dumps({"model": OLLAMA_MODEL, "prompt": prompt, "stream": False}).encode(),
        headers={"Content-Type": "application/json"})
    return json.load(urllib.request.urlopen(req, timeout=120))["response"]


# ---------- UI ----------
st.set_page_config(page_title="Recherche doc unifiée", page_icon="🔎")
st.title("🔎 Recherche unifiée de la documentation")

with st.sidebar:
    st.header("Indexation")
    def index_with_progress(with_github):
        bar = st.progress(0, text="Démarrage...")
        n = index_all(with_github, progress_cb=lambda frac, label: bar.progress(frac, text=label))
        bar.empty()
        st.success(f"{n} passages indexés")

    if st.button("Indexer GitHub + dossiers locaux"):
        index_with_progress(True)
    if st.button("Réindexer les dossiers locaux seulement"):
        index_with_progress(False)
    st.caption(f"Passages en base : {col.count()}")
    use_llm = st.checkbox("Rédiger une réponse avec Ollama", value=False)

question = st.text_input("Pose ta question", placeholder="Comment déployer le projet X ?")

if question and col.count() > 0:
    res = col.query(query_texts=[question], n_results=5)
    hits = [(d, m, dist) for d, m, dist in
            zip(res["documents"][0], res["metadatas"][0], res["distances"][0]) if dist < SEUIL]
    if not hits:
        st.warning("Je n'ai pas trouvé d'information fiable sur ce sujet dans les sources indexées.")
    else:
        if use_llm:
            try:
                st.markdown("### Réponse")
                st.write(ask_llm(question, [h[0] for h in hits]))
            except Exception as e:
                st.error(f"Ollama indisponible : {e}")
        st.markdown("### Sources")
        for i, (doc, meta, dist) in enumerate(hits, 1):
            with st.expander(f"[{i}] {meta['origin']} — {meta['source']}  (pertinence {1-dist:.0%})"):
                st.write(doc)
elif question:
    st.info("Aucun document indexé : clique d'abord sur « Indexer » dans la barre latérale.")// test changelog feat
// test changelog fix
