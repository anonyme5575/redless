# Connecter Redless à Supabase (classement mondial)

Durée : 10 minutes, faisable sur téléphone. Offre gratuite de Supabase suffisante.

## 1. Créer le projet
Supabase → **New project** :
- **Project name** : `redless`
- **Database password** : touche **Generate a password** et garde-le dans ton gestionnaire de mots de passe. Il ne sert qu'à toi ; ne le donne à personne, moi compris.
- **Region** : **West EU (Paris)** (ou Frankfurt) : données en Europe, plus proche des joueurs.
- **Create new project**, puis attends 1 à 2 minutes.

## 2. Créer les tables et les règles
1. Menu de gauche → **SQL Editor** → **New query**.
2. Colle **tout** le contenu de [`schema.sql`](schema.sql).
3. **Run**. Le message attendu est « Success. No rows returned ».

Le script peut être relancé sans risque.

## 3. Autoriser les joueurs anonymes
**Authentication** → **Sign In / Providers** (ou **Settings**) → active **Allow anonymous sign-ins** → **Save**.
Chaque téléphone reçoit ainsi un identifiant anonyme : pas d'e-mail, pas de mot de passe pour les joueurs.

Recommandé : **Authentication → Attack Protection** → active le **CAPTCHA** plus tard si des comptes de spam apparaissent.

## 4. Récupérer les deux valeurs pour le jeu
**Project Settings** (roue crantée) → **API** (ou **Data API** / **API Keys**) :
- **Project URL** : `https://xxxxxxxx.supabase.co`
- **Clé publique** : `anon` / `public`, ou `sb_publishable_…`

Ces deux valeurs sont **publiques par conception** : elles sont dans le jeu et n'importe qui peut les lire. La sécurité vient des règles du serveur (`schema.sql`).
**Ne copie jamais** la clé `service_role` / `sb_secret_…` ni le mot de passe de la base.

## 5. Les mettre dans le jeu
Dans [`js/online-config.js`](../js/online-config.js) :
```js
window.REDLESS_ONLINE = {
  url: "https://xxxxxxxx.supabase.co",
  key: "ta-clé-publique",
};
```
Puis reconstruire l'APK (`android/build.sh`). Vercel redéploie tout seul à la fusion dans `main`.

## 6. E-mail à chaque installation
Le serveur prévient **scalariapp@gmail.com** à chaque nouvelle installation : premier lancement de l'APK, ou appli ajoutée à l'écran d'accueil. L'envoi passe par **Resend**, gratuit jusqu'à 100 e-mails par jour.
1. Crée un compte sur **https://resend.com** **avec l'adresse scalariapp@gmail.com**. Sans domaine vérifié, Resend n'envoie qu'à l'adresse du compte, et c'est justement celle-là.
2. Resend → **API Keys** → **Create API Key**, avec la permission **Sending access**. Copie la clé, qui commence par `re_`.
3. Supabase → **SQL Editor** : relance `schema.sql` (il ajoute la table `installs` et active `pg_net`), puis exécute, en remplaçant la clé :
   ```sql
   select vault.create_secret('re_TA_CLE_ICI', 'resend_api_key');
   ```
   La clé reste chiffrée dans le coffre de Supabase. **Ne la donne à personne**, elle permet d'envoyer des e-mails en ton nom.
4. Test : désinstalle puis réinstalle l'APK, ouvre-le. L'e-mail arrive dans la minute ; pense à regarder les **Spams** la première fois.

Garde-fous :
- le même appareil n'est compté qu'une fois ;
- au-delà de 30 installations par heure, elles sont comptées sans e-mail, pour éviter l'inondation ;
- liste complète dans **Table Editor** → `installs`.

Pour changer l'adresse ou le plafond : fonction `redless_install_settings()` dans `schema.sql`.
Pour changer la clé : `select vault.update_secret((select id from vault.secrets where name = 'resend_api_key'), 're_NOUVELLE_CLE');`

## Fonctionnement
| Règle | Où |
|---|---|
| Un score n'est classé qu'avec un pseudo (2 à 14 caractères, unique) | `submit_score` |
| Meilleur score par joueur, par mode et par saison | table `best_scores` |
| Score refusé s'il dépasse 25 points par seconde de jeu, ou si deux envois ont lieu en moins de 5 s | `submit_score` |
| Événement : démarre **7 jours après le 30e joueur** | `app_state.threshold_reached_at` |
| Remise à zéro **tous les mois** à partir du début de l'événement (saison 1, 2, 3…) ; l'historique est conservé | `event_info` |
| Avant l'événement : « pré-saison » (saison 0), déjà classée | `event_info` |
| Épreuve officielle de l'événement : mode Classique ; les 6 autres modes ont aussi leur classement mensuel | jeu |
| Tables fermées : tout passe par les fonctions | RLS + `revoke` |

Réglages (nombre de joueurs, délai) : fonction `redless_settings()` en tête de `schema.sql`.

## Consulter ou modérer
**Table Editor** → `players` (pseudos), `best_scores` (classement), `runs` (toutes les parties envoyées).
Pour supprimer un tricheur ou un pseudo offensant : supprimer sa ligne dans `players`. Ses scores partent avec.

## Limites
Un score envoyé par un téléphone peut toujours être falsifié par quelqu'un de déterminé. Les contrôles de vraisemblance bloquent les triches grossières, pas toutes. Surveille le haut du classement pendant l'événement.
