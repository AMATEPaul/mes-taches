# Mes Tâches

Une petite appli pour ne plus oublier ses tâches et savoir quoi faire en premier.
Chaque tâche est rangée dans une des 4 catégories, de la plus urgente à la moins urgente :

| Catégorie | Pour quoi |
|---|---|
| ⚡ **Immédiate** | À faire tout de suite |
| **Prioritaire** | Aujourd'hui |
| **Important** | Cette semaine |
| **Ça va** | Quand j'ai le temps |

## Sur Android : l'appli (APK)

Télécharge **[MesTaches.apk](https://github.com/AMATEPaul/mes-taches/releases/latest/download/MesTaches.apk)** sur ton téléphone et ouvre-le.
Android demande d'autoriser l'installation depuis ton navigateur (« Sources inconnues ») : accepte pour cette fois.
L'appli se met à jour toute seule (elle charge la dernière version du site), et marche sans connexion après le premier lancement.

Tu avais déjà des tâches dans la version Chrome ? Dans Chrome : **Sauvegarder / restaurer mes tâches → Copier mes tâches**, puis dans l'APK : **Sauvegarder / restaurer → colle → Restaurer**.

## Sur téléphone, sans installer d'APK (Android et iPhone)

Ouvre **https://amatepaul.github.io/mes-taches/** sur ton téléphone, puis :

- **Android (Chrome)** : menu ⋮ → **Ajouter à l'écran d'accueil** (ou **Installer l'application**).
- **iPhone (Safari)** : bouton Partager → **Sur l'écran d'accueil**.

L'appli s'ouvre ensuite comme une vraie appli, même sans connexion.
Les tâches restent enregistrées sur le téléphone.

## Sur PC Windows

Télécharge `MesTaches-Installation-x.y.z.exe` dans les [Releases](https://github.com/AMATEPaul/mes-taches/releases), puis lance-le.
Windows peut afficher « Windows a protégé votre ordinateur » : clique sur **Informations complémentaires** puis **Exécuter quand même**.

## Utilisation

- Écris une tâche, choisis sa catégorie, puis **Ajouter** (ou Entrée).
- **Rond** : marquer comme terminée. **▲ / ▼** : changer de catégorie. **Corbeille** : supprimer.
- Modifier le texte : appui sur la tâche (téléphone) ou double-clic (PC).
- **Déplacer une tâche** : sur téléphone, appui long dessus puis glisse-la vers une catégorie (la catégorie survolée s'allume, les autres tâches s'écartent pour lui faire de la place). Sur PC, glisse-la à la souris.
- Raccourcis PC : `Ctrl+1` … `Ctrl+4` pour la priorité, `Ctrl+N` pour écrire une tâche.

## Pour les développeurs

```bash
npm install
npm start        # lance la version PC
npm run dist     # fabrique l'installeur Windows dans dist/
```

L'APK Android est fait avec [Capacitor](https://capacitorjs.com) 8 (dossier `android/`, configuration `capacitor.config.json`) : il affiche le site publié sur GitHub Pages, avec `src/offline.html` si le tout premier lancement se fait sans internet. Fabrication : `npx cap sync android` puis `android/gradlew assembleRelease` avec la clé de signature (gardée hors du dépôt).

Le glisser-déposer utilise [SortableJS](https://github.com/SortableJS/Sortable) 1.15.7 (licence MIT), copié dans `src/vendor/` pour marcher hors connexion.

Le dossier `src/` contient toute l'appli (HTML, CSS, JS). Il sert à la fois à la version PC (Electron) et à la version web publiée sur GitHub Pages (branche `gh-pages`).
