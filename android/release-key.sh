#!/usr/bin/env bash
# Creates your release (upload) key for the Play Store. Run it once, on your own computer.
#
# KEEP THE .jks FILE AND ITS PASSWORDS SAFE AND BACKED UP (two places, not in this repository).
# Lose them and you can never publish an update of the app under the same name again.
set -euo pipefail
KS="${1:-$HOME/redless-release.jks}"
ALIAS="${2:-redless}"
if [ -e "$KS" ]; then echo "$KS existe déjà : rien n'est écrasé."; exit 1; fi
keytool -genkeypair -v -keystore "$KS" -alias "$ALIAS" -keyalg RSA -keysize 4096 -validity 10000
cat <<MSG

Clé créée : $KS (alias $ALIAS)
Pour construire une version signée :
  export RELEASE_KEYSTORE="$KS" RELEASE_KEY_ALIAS="$ALIAS"
  read -rs RELEASE_STORE_PASSWORD && export RELEASE_STORE_PASSWORD
  android/build.sh aab        # fichier à envoyer sur la Play Console
  android/build.sh            # APK signé avec la même clé
MSG
