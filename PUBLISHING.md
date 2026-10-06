# Publier sur le Play Store

## 1. Avant tout
- **Droits de la musique.** « Sync or Die » ne peut être publiée qu'avec une licence de diffusion. Sans licence, construire avec `NO_LICENSED_MUSIC=1` : le jeu utilise alors sa piste Synthé, générée en direct.
- **Tests sur téléphone** : voir `TESTS.md`.

## 2. Clé de publication (une seule fois, sur ton ordinateur)
```sh
android/release-key.sh            # crée ~/redless-release.jks
```
Sauvegarde le fichier `.jks` et ses mots de passe à deux endroits, **jamais dans ce dépôt**. Sans eux, plus aucune mise à jour possible.
Sur la Play Console, active **Play App Signing** : Google garde la clé de signature finale, ta clé `.jks` sert de clé d'importation (récupérable auprès de Google si elle est perdue).

## 3. Construire le fichier à envoyer
```sh
export RELEASE_KEYSTORE=~/redless-release.jks RELEASE_KEY_ALIAS=redless
read -rs RELEASE_STORE_PASSWORD && export RELEASE_STORE_PASSWORD
VERSION_CODE=6 VERSION_NAME=2.3 NO_LICENSED_MUSIC=1 android/build.sh aab
# -> dist/redless.aab
```
Chaque nouvelle version envoyée doit avoir un `VERSION_CODE` plus grand.

## 4. Play Console
1. Créer un compte développeur (25 $ une fois) et une application « Redless », langue par défaut français, type Jeu, gratuit.
2. **Fiche du Store** : textes dans `store/fr-FR/`, icône `store/icon-512.png`, bannière `store/feature-graphic.png`, captures `store/screenshots/` (6 × 1080×1920).
3. **Règles de confidentialité** : URL de `PRIVACY.md` sur GitHub (dépôt public) ou toute page web qui en reprend le texte.
4. **Sécurité des données** : « Aucune donnée collectée », « Aucune donnée partagée ».
5. **Classification du contenu** : questionnaire, jeu sans violence ni achat ni interaction entre joueurs → PEGI 3 attendu.
6. **Public cible** : 13 ans et plus (en dessous, le programme Familles impose des contraintes supplémentaires).
7. **Publicités** : non.
8. **Test fermé** : les nouveaux comptes personnels doivent faire tester l'appli par au moins 12 testeurs pendant 14 jours avant la production (règle Google en vigueur depuis fin 2023 ; vérifier l'état actuel dans la Play Console).
9. Envoyer `dist/redless.aab` dans la piste de test, puis en production.
