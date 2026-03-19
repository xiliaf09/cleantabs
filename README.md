# CleanTabs

Extension Chrome/Edge pour garder tes onglets sous contrôle.

## Fonctionnalités

- **Fermeture des doublons** — Détecte et ferme les onglets avec la même URL
- **Fermeture des inactifs** — Onglets pas utilisés depuis 15 min
- **Jarvis Mode** — Ferme TOUT et ouvre uniquement Jarvis Hub (un clic)
- **Raccourci clavier** — `Ctrl+Shift+X` pour nettoyer sans ouvrir le popup

## Interface

- Dark theme, groupé par domaine
- Badges visuels : doublons (rouge), inactifs (orange), actifs (vert)
- Fermeture individuelle par onglet ou par groupe de domaine
- Bouton "Tout nettoyer" : supprime doublons + inactifs + garde le plus récent par domaine

## Installation

1. Ouvrir `chrome://extensions` (ou `edge://extensions`)
2. Activer le **Mode développeur** (toggle en haut à droite)
3. Cliquer **Charger l'extension non empaquetée**
4. Sélectionner ce dossier

## Structure

```
cleantabs/
├── manifest.json      # Config extension (Manifest V3)
├── background.js      # Service worker — tracking inactivité + raccourci clavier
├── popup.html         # Interface du popup (dark theme)
├── popup.js           # Logique du popup — analyse, rendu, actions
├── icons/
│   ├── icon.svg       # Logo source (Jarvis)
│   ├── icon16.png     # Icône 16x16
│   ├── icon48.png     # Icône 48x48
│   └── icon128.png    # Icône 128x128
└── README.md
```

## Raccourcis

| Action | Raccourci |
|--------|-----------|
| Nettoyer (doublons + inactifs) | `Ctrl+Shift+X` |
| Ouvrir le popup | Clic sur l'icône |

## Stack

- Chrome Extension Manifest V3
- Vanilla JS, zéro dépendance
