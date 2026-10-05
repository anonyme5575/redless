# Ne touche pas le rouge

Jeu mobile en portrait, jouable à un doigt, en HTML/CSS/JS sans dépendance ni build.

- Touche les cases **vertes** (rond) et **dorées** (étoile, +5 pièces).
- Une case **rouge** (croix) touchée = partie terminée. Trois vertes ratées aussi.
- Le tempo de la musique (générée en direct via Web Audio) est l'horloge du jeu : une case apparaît par temps, et le BPM monte de 96 à 184 tous les 12 verts.
- Combo ×2 / ×3 / ×4 à 10 / 25 / 50 verts d'affilée.
- Pièces gagnées = score ÷ 5 + bonus dorés. Boutique : 6 thèmes, 5 effets, 5 formes.
- Classement : top 10 local (localStorage), sauvegarde auto, installable en PWA.

## Lancer

```sh
python3 -m http.server 8000
# puis ouvrir http://localhost:8000 (ou l'IP de la machine depuis le téléphone)
```

## Structure

```
index.html            écrans (menu, partie, fin, boutique, classement)
css/style.css         thèmes, formes de cases, animations
js/game.js            boucle de jeu, audio, effets, boutique, sauvegarde
assets/               joueur, avatar, icônes PWA
manifest.webmanifest
```

Les réglages de difficulté sont en tête de `js/game.js` (`START_BPM`, `MAX_BPM`, `BPM_STEP`, `GREENS_PER_LEVEL`, `LIVES`) et dans `lifetimeMs()` / `redChance()` / `spawnsThisBeat()`.
