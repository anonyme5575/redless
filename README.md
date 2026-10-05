# Ne touche pas le rouge

Jeu mobile en portrait, jouable à un doigt. HTML/CSS/JS sans dépendance, emballé en APK Android.

## Règles

- Touche les cases **vertes** (rond) et **dorées** (étoile, +5 pièces).
- Une case **rouge** (croix) touchée = partie terminée.
- **Fintes** : certaines cases changent de couleur en cours de route.
  - vert → rouge : touche-la vite, avant qu'elle tourne ;
  - rouge → vert : attends qu'elle passe au vert ;
  - clignotante : alterne vert/rouge à chaque demi-temps.
  Une finte réussie rapporte double.
- Le tempo de la musique (générée en direct, Web Audio) est l'horloge du jeu. Chaque palier de verts ajoute des BPM (jusqu'à 230), raccourcit la durée de vie des cases et fait apparaître plusieurs cases par temps.

## Modes

| Mode | Vies | Départ | Particularité |
|---|---|---|---|
| Classique | 3 | 110 BPM | +10 BPM tous les 8 verts, fintes dès le niveau 2 |
| Chrono | – | 120 BPM | 60 s, rouge = −5 s, accélère aussi avec le temps |
| Mort subite | 1 | 150 BPM | une erreur et c'est fini |
| Fintes | 3 | 104 BPM | plus de la moitié des cases sont des fintes |

Pièces = score ÷ 5 + bonus dorés. Boutique : 6 thèmes, 5 effets, 5 formes. Record et classement (top 10 local) par mode.

## APK Android

```sh
android/build.sh          # -> dist/ne-touche-pas-le-rouge.apk
```

Besoin seulement d'un JDK 17+, `curl` et `unzip` : `android/fetch-tools.sh` télécharge android.jar (API 34), aapt2, d8 et uber-apk-signer dans `android/.tools`. Pas d'Android Studio ni de SDK.
L'APK est signé avec une clé de **debug** : parfait pour l'installer soi-même, à remplacer par une vraie clé avant le Play Store.
Le workflow `.github/workflows/apk.yml` reconstruit l'APK à chaque push.

Installation sur le téléphone : copier l'APK, l'ouvrir, autoriser « Installer des applis inconnues » pour le gestionnaire de fichiers.

## Version web

```sh
python3 -m http.server 8000   # puis http://localhost:8000
```

## Structure

```
index.html, css/, js/game.js, fonts/, assets/   le jeu
android/                                         wrapper WebView + scripts de build
dist/ne-touche-pas-le-rouge.apk                  APK prêt à installer
```

Réglages : objet `MODES` en tête de `js/game.js`, puis `lifetimeMs()`, `redChance()`, `feintChance()`, `spawnsThisBeat()`.
