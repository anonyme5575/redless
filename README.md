# Redless

*Redless* = « sans rouge » en anglais.

Jeu mobile en portrait, jouable à un doigt, avec une interface de cockpit holographique. Touche les cases vertes, jamais les rouges. Les cases tombent sur les temps de la musique, et la musique accélère sans arrêt.

HTML/CSS/JS sans dépendance, emballé en application Android (APK pour installer directement, AAB pour le Play Store).

## Jouer

- **Android** : installer `dist/redless.apk` (ou l'artefact du workflow « APK » dans l'onglet Actions).
- **iPhone / iPad** : ouvrir le site (déployé sur Vercel) dans **Safari**, puis **Partager → Sur l'écran d'accueil**. Redless s'installe comme une appli : plein écran, icône, fonctionne hors ligne (`sw.js`), le son joue même en mode silencieux (iOS 16.4+). Seule limite : Safari ne donne pas accès au vibreur.
- **Navigateur** : `python3 -m http.server 8000` puis http://localhost:8000. Sur Android, Chrome propose aussi « Installer ».

## Règles

- **Vert** (rond) : à toucher. **Doré** (étoile) : +5 crédits. **Rouge** (croix) : défaite.
- **Fintes** (score double) : vert → rouge (touche vite), rouge → vert (attends), clignotante (vise le vert).
- **Spéciales** (dès le niveau 3) : bleue = tempo ralenti 3 s ; violette = efface les rouges ; noire = garder le doigt appuyé. Rater une bleue ou une violette ne coûte rien ; rater une noire coûte une vie, comme une verte.
- **Boss** tous les 5 niveaux (Classique, Mort subite, Fintes, Défi, Duel) : 15 s de fintes et de cases en plus ; y survivre rapporte +50 points et +20 crédits.
- **Combo** : x2 à 10, x3 à 25, x4 à 50 (jauge Bouclier).
- **Tempo** : la musique est l'horloge. Départ lent (72 BPM, morceau à x0,72), +15 BPM par minute en continu, et un saut à chaque palier, joué en glissando, jusqu'à 200 BPM (x2, hauteur conservée).

## Modes

| Mode | Vies | Départ | Particularité |
|---|---|---|---|
| Classique | 3 | 72 BPM | +9 BPM tous les 8 verts, fintes dès le niveau 2 |
| Chrono | – | 80 BPM | 60 s, rouge = −5 s |
| Mort subite | 1 | 95 BPM | une erreur et c'est fini |
| Fintes | 3 | 72 BPM | plus de la moitié des cases sont des fintes |
| Expansion | 3 | 72 BPM | la grille passe de 2×3 à 7×9 |
| Rythme | 3 | 80 BPM | toucher quand l'anneau se referme : Parfait (±70 ms), Bien (±150 ms) |
| Miroir | 3 | 76 BPM | la couleur à toucher s'inverse tous les 16 temps |
| Défi du jour | 3 | 72 BPM | même suite de cases pour tous, un essai officiel par jour |
| Duel | 3 | 72 BPM | un code de 5 caractères = la même partie pour les deux joueurs |

## Niveaux (campagne)

**200 niveaux** en 20 mondes de 10 (`js/levels.js`), chacun avec **son propre thème de couleurs**, un mode, une difficulté qui monte, et **3 quêtes** : la première (score) réussit le niveau et ouvre le suivant, les deux autres sont des bonus. Chaque quête rapporte des crédits la première fois ; les 3 quêtes débloquent le thème du niveau dans la boutique (onglet Niveaux).

## Difficulté

Dans **Modes de jeu** : Facile, Normal, Difficile, Hardcore, Impossible (tempo, fintes, durée des cases, vies, crédits ×0,5 à ×3). Facile n'est pas classé au mondial ; le Défi du jour et le Duel restent en Normal.

## Progression

- **Crédits** = score ÷ 5 + bonus. Boutique : 6 thèmes, 5 effets, 5 formes, à essayer avant d'acheter.
- **Missions** : 3 par jour (tirées d'une liste de 14), crédits à la clé.
- **Rangs** selon les points de carrière (somme des scores) : Recrue, Cadet, Pilote, Vétéran, Élite, Spectre, Légende.
- **Partage** du score en image (1080×1350). Le classement est uniquement mondial (voir plus bas).

## Classement mondial et événement

Via Supabase (offre gratuite) : un pseudo, un identifiant anonyme par téléphone, des scores contrôlés côté serveur. En option, le joueur **protège son compte** avec son e-mail (code reçu par e-mail, sans mot de passe) : sa progression est sauvegardée en ligne et il la retrouve sur un autre téléphone.
L'**événement** démarre **7 jours après le 30e joueur**, puis le classement **repart de zéro chaque mois** (saison 1, 2, 3…). Le classement est général : une ligne par joueur, avec le total de ses meilleurs scores de la saison dans tous les modes ; toucher un joueur ouvre son profil (ses scores mode par mode). Sans pseudo, le jeu en donne un automatiquement (« Pilote-1234 »), modifiable dans Réglages. Avant l'événement : pré-saison.
Mise en place : **[`supabase/README.md`](supabase/README.md)** (SQL à coller : `supabase/schema.sql`, puis URL et clé publique dans `js/online-config.js`).

## Mises à jour

À chaque déploiement, le site publie `version.json` (tiré de `VERSION` dans `js/game.js`). Si le jeu installé est plus ancien, une barre **« Mettre à jour »** apparaît : l'appli web se recharge, l'appli Android télécharge le nouvel APK publié par GitHub (release « latest »). Pour sortir une version : changer `VERSION` (game.js), `CACHE` (sw.js), `app-version` (index.html) et `VERSION_CODE/NAME` (android/build.sh).

## Confort

- **Tutoriel** interactif en 8 étapes au premier lancement (revoir dans Réglages).
- **Calibrage** du décalage audio : on tape sur 16 temps, le jeu mesure le retard du son et le compense.
- **Écran de fin** qui explique la défaite (finte, piège, mauvaise cible…).
- Volumes séparés, vibrations désactivables, **mode daltonien renforcé** (motifs sur les cases), choix de la piste (« Sync or Die » ou Synthé).

## Android

```sh
android/build.sh            # APK  -> dist/redless.apk
android/build.sh aab        # AAB  -> dist/redless.aab (Play Store)
android/release-key.sh      # crée ta clé de publication (une seule fois)
```
Il faut seulement un JDK 17+, `curl`, `unzip` et `zip` : `android/fetch-tools.sh` télécharge android.jar (API 34), aapt2, d8, uber-apk-signer et bundletool. Pas besoin d'Android Studio.
Sans clé, l'APK est signé en debug et l'AAB n'est pas signé. `NO_LICENSED_MUSIC=1` retire la musique sous droits (le jeu passe sur la piste Synthé).
Le wrapper (`android/src/.../MainActivity.java`) fournit le plein écran, le bouton Retour, la pause en arrière-plan, les vibrations et le partage natif.

Publication : voir **`PUBLISHING.md`**. Tests sur téléphone : **`TESTS.md`**. Confidentialité : **`PRIVACY.md`**. Fiche du Store : **`store/`**.

## Droits

Redless © 2026 anonyme5575, tous droits réservés. La musique « Sync or Die » est une œuvre originale protégée : aucune réutilisation sans autorisation écrite. Détails dans [`COPYRIGHT.md`](COPYRIGHT.md).

## Structure

```
index.html                  écrans
css/style.css               HUD, cases, animations
js/config.js                modes, boutique, missions, rangs, pistes
js/audio.js                 musique (horloge du jeu), synthé, vibrations
js/visuals.js               cadres, pluie, particules, carte de partage
js/game.js                  moteur, tutoriel, calibrage, écrans
audio/ fonts/ assets/       musique (jeu : sync-or-die.mp3, every-scar-a-shield.mp3, the-velvet-hour.mp3 ; menu : sync-or-die-original.mp3, fichier d'origine non modifié), polices, images
android/                    wrapper WebView et scripts de build
store/                      textes, icône, bannière, captures du Play Store
```

Réglages de difficulté : objet `MODES` dans `js/config.js`, puis `lifetimeMs()`, `redChance()`, `feintChance()`, `spawnsThisBeat()` dans `js/game.js`.
Ajouter une musique : une entrée dans `TRACKS` (`js/config.js`) avec son tempo et la position de son premier temps.
