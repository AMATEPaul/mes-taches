# Tests

Ils pilotent la vraie appli dans Electron, avec de vrais gestes simulés (Chrome DevTools Protocol).

```bash
# Téléphone 390×844 en tactile : UA = android (défaut), iphone ou ipad ; --dark pour le thème sombre
UA=iphone node_modules/electron/dist/electron tests/phone.test.js
# PC à la souris
node_modules/electron/dist/electron tests/pc.test.js
# Programme PC réel (main.js) : enregistrement, relecture, fichier abîmé, lecture impossible
node_modules/electron/dist/electron tests/main.test.js
```

Les résultats et captures d'écran vont dans `tests/suite-out/`.
