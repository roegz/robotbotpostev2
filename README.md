# 🤖 robotbotposte

Le réseau social **éphémère** : posts, photos, vidéos en scroll vertical, amis, likes,
commentaires, reposts et messages privés… **tout disparaît 12 h après sa publication.**

Interface 100 % en français, thème sombre, pensée mobile d'abord.

---

## ✨ Fonctionnalités

- **Compte** : inscription, connexion, session JWT en cookie `httpOnly`.
- **Posts** : texte, photo ou vidéo (un média par post), compteur de caractères.
- **Feed** : deux onglets — *Amis* (toi + tes amis acceptés) et *Découvrir* (tout le monde).
- **Scroll** : feed vertical plein écran façon TikTok, autoplay, son activable.
- **Interactions** : likes, commentaires, repost simple et citation, suppression.
- **Amis** : recherche par pseudo/nom, demandes envoyées/reçues, acceptation, retrait.
- **Messages privés** : conversations en temps réel (Socket.IO), indicateur « écrit… »,
  badge de messages non lus, envoi optimiste.
- **Profils** : avatar emoji, nom affiché, bio, statistiques.
- **Expiration automatique** : posts, commentaires **et** messages sont supprimés
  `POST_TTL_HOURS` heures (12 par défaut) après leur création, avec purge des fichiers
  médias et des uploads orphelins.

---

## 🧱 Stack

| Élément        | Choix                                                       |
| -------------- | ----------------------------------------------------------- |
| Serveur        | Node.js + Express 4                                          |
| Temps réel     | Socket.IO                                                    |
| Front          | SPA vanilla JS (modules ES, hash router), sans build         |
| Styles         | CSS maison                                                   |
| Base locale    | SQLite via `node:sqlite` (zéro config)                        |
| Base prod      | PostgreSQL via `pg` (Neon, Supabase, Render Postgres…)        |
| Auth           | bcryptjs + JWT (`jsonwebtoken`) dans un cookie `httpOnly`     |
| Médias         | upload multer sur disque local (`uploads/`)                   |

Le choix de la base est automatique :

- `DATABASE_URL` **absente** → SQLite dans `data/robotbotposte.db`.
- `DATABASE_URL` **présente** → PostgreSQL.

---

## 🚀 Démarrage local

Prérequis : **Node.js ≥ 22.13** (nécessaire pour `node:sqlite`).

```bash
npm install
npm start
```

Ouvre ensuite <http://localhost:3000>.

En développement (redémarrage auto) :

```bash
npm run dev
```

### Configuration (`.env`)

Copie `.env.example` en `.env` puis adapte :

```bash
cp .env.example .env
```

| Variable         | Défaut | Rôle                                                        |
| ---------------- | ------ | ----------------------------------------------------------- |
| `PORT`           | `3000` | Port HTTP                                                    |
| `JWT_SECRET`     | généré | Secret de signature des sessions (obligatoire en prod)       |
| `POST_TTL_HOURS` | `12`   | Durée de vie des posts, commentaires et messages             |
| `MAX_UPLOAD_MB`  | `40`   | Taille max d'un fichier envoyé                               |
| `DATABASE_URL`   | vide   | URL PostgreSQL ; vide = SQLite                               |
| `UPLOAD_DIR`     | `./uploads` | Dossier de stockage des médias                          |

Sans `.env`, l'app démarre quand même avec SQLite et un secret de développement.

---

## 🐘 PostgreSQL / Neon (recommandé en production)

1. Crée un projet gratuit sur [Neon](https://neon.tech).
2. Récupère la chaîne de connexion (bouton **Connect**), du type :

   ```text
   postgresql://user:password@ep-xxx.eu-central-1.aws.neon.tech/neondb?sslmode=require
   ```

3. Ajoute-la dans `.env` :

   ```bash
   DATABASE_URL=postgresql://...
   ```

4. Relance `npm start`. Les tables sont créées automatiquement.

---

## ☁️ Déploiement sur Render (gratuit)

Le dépôt contient déjà `render.yaml`, donc le déploiement se fait en quelques clics.

### 1. Mettre le projet sur GitHub

Le plus simple : décompresse l'archive fournie, puis :

```bash
git init
git add .
git commit -m "robotbotposte"
git branch -M main
git remote add origin https://github.com/TON_COMPTE/robotbotposte.git
git push -u origin main
```

> `node_modules/`, `.env`, `data/` et `uploads/` sont déjà ignorés par `.gitignore`.
> Ne publie **jamais** ton fichier `.env` ni ton `JWT_SECRET`.

### 2. Créer le service Render

**Méthode recommandée — Blueprint :**

1. Va sur <https://dashboard.render.com> → **New** → **Blueprint**.
2. Choisis ton dépôt GitHub `robotbotposte`.
3. Render lit `render.yaml` et propose le service. Clique sur **Apply**.
4. Au moment de renseigner `DATABASE_URL`, colle l'URL Neon de l'étape précédente
   (ou laisse vide pour SQLite, voir les limites plus bas).
5. Attends la fin du build, puis ouvre l'URL `https://robotbotposte.onrender.com`.

**Méthode manuelle — Web Service :**

1. **New** → **Web Service** → choisis le dépôt.
2. Runtime **Node**, plan **Free**, région **Frankfurt** (ou la plus proche).
3. Build command : `npm ci`
4. Start command : `npm start`
5. Health check path : `/api/health`
6. Variables d'environnement :
   - `NODE_ENV=production`
   - `JWT_SECRET` → une longue chaîne aléatoire (ou *Generate*)
   - `POST_TTL_HOURS=12`
   - `DATABASE_URL` → ton URL Neon (fortement conseillé)
7. **Create Web Service**.

Render installe les dépendances, démarre le serveur et vérifie `/api/health`.
Chaque `git push` sur `main` redéploie automatiquement.

### ⚠️ Limites du plan gratuit Render

- Le service **s'endort** après ~15 min d'inactivité : le premier chargement peut prendre
  30 à 60 s.
- Le disque est **éphémère**. Conséquences :
  - avec SQLite, comptes et posts sont perdus à chaque redéploiement/redémarrage ;
    **utilise `DATABASE_URL` (Neon)** pour garder les données ;
  - les **photos et vidéos** stockées dans `uploads/` sont également perdues.
    Pour des médias durables, branche un stockage externe (Cloudinary, S3, R2…)
    ou un disque persistant Render (payant).

---

## ⏳ Changer la durée de vie

```bash
POST_TTL_HOURS=6
```

La valeur est lue au démarrage et affichée dans l'interface (comptes à rebours,
textes, badge « 12 h »). La purge tourne toutes les 2 minutes.

> Les commentaires suivent la durée de vie de leur post ; les messages ont leur propre
> expiration calculée à l'envoi.

---

## 🔐 Sécurité

- Mots de passe hachés avec **bcrypt**.
- Session JWT signée, cookie `httpOnly`, `SameSite=Lax`, `Secure` en production.
- En-têtes de sécurité via **Helmet** + CSP stricte.
- Vérification d'origine sur les requêtes d'écriture (anti-CSRF basique).
- Limitation de débit sur l'API et sur les uploads.
- Validation côté serveur des longueurs, pseudos, types MIME et tailles de fichiers.
- Les contenus utilisateur sont insérés via `textContent` (pas de `innerHTML`).

En production, définis impérativement un `JWT_SECRET` long et aléatoire, et sers l'app
en **HTTPS** (Render le fait automatiquement).

---

## 📁 Structure

```text
.
├── public/                 # SPA (HTML, CSS, modules JS, favicon)
│   ├── css/app.css
│   ├── js/                 # api, state, ui, posts, social, chat, auth...
│   └── index.html
├── server/
│   ├── index.js            # Express + Socket.IO + sécurité
│   ├── config.js           # variables d'environnement
│   ├── db.js               # abstraction SQLite / PostgreSQL
│   ├── schema.sqlite.sql
│   ├── schema.pg.sql
│   ├── auth.js             # JWT, cookies, bcrypt
│   ├── cleanup.js          # purge des contenus expirés
│   ├── socket.js           # messages temps réel
│   └── routes/             # auth, users, friends, posts, messages, upload
├── render.yaml             # déploiement Render (Blueprint)
├── docker-compose.yml      # PostgreSQL local optionnel
├── .env.example
└── package.json
```

---

## 🧪 Vérifier que tout va bien

```bash
curl http://localhost:3000/api/health
# {"ok":true,"app":"robotbotposte","db":"sqlite","ttl_hours":12}
```

---

## 📝 Licence

Projet personnel — fais-en ce que tu veux. 🦾
