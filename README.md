# La Tournée

Démo autonome d’un tableau visuel pour amorcer l’organisation d’une tournée infirmière.

## Ouvrir la démo

Double-cliquer simplement sur `index.html`.

Aucune installation, aucun serveur local et aucune commande ne sont nécessaires. Le navigateur charge directement `styles.css` et `app.js`, qui doivent rester dans le même dossier que `index.html`.

## Principe testé

- La journée va de 07:00 à 19:00, avec une colonne toutes les 30 minutes.
- Chaque colonne indique son heure complète — par exemple 10:30, 11:00 et 11:30 — afin d’éviter toute ambiguïté.
- Chaque patient occupe une ligne distincte.
- Les patients sont classés alphabétiquement ; plusieurs interventions concernant la même personne apparaissent ainsi sur des lignes voisines.
- Une barre verte continue matérialise sa fenêtre horaire possible.
- Deux poignées rondes très visibles aux extrémités du rectangle règlent son début et sa fin.
- Les libellés minimal et maximal sont alignés exactement sous l’heure correspondante, notamment la borne maximale.
- Les deux bornes sont inclusives : une infirmière peut être placée à l’heure minimale comme à l’heure maximale de la plage.
- Le centre du rectangle permet de déplacer toute la plage sans changer sa durée.
- Une infirmière se dépose sur le rectangle représentant la plage horaire du patient ; le reste de la ligne est visuellement inactif.
- La même infirmière reste disponible et peut être réutilisée autant de fois que nécessaire, y compris sur deux demi-heures voisines ou plusieurs fois chez le même patient.
- Une infirmière sélectionnée reste active pour tous les placements suivants jusqu’à ce qu’une autre infirmière soit choisie.
- Un clic sur une infirmière puis sur un créneau constitue une alternative au glisser-déposer.
- Après cette sélection, un clic gauche directement dans la plage horaire d’un patient pose l’infirmière sur la demi-heure visée.
- Un clic simple sélectionne l’infirmière sans déplacer la page.
- Un double-clic ouvre ou referme son emploi du temps complet, sous forme de frise et de tableau chronologique.
- Une fois ouvert, cet emploi du temps se referme automatiquement au clic suivant dans la page.
- Un clic droit sur une infirmière ouvre sa fiche modifiable : nom, prénom, numéro professionnel et téléphone.
- Un clic droit sur le nom d’un patient ouvre sa fiche : nom, prénom, téléphone et choix de l’intervention dans une liste déroulante.
- **Nouvelle infirmière** et **Nouveau patient** ouvrent ces mêmes fiches vides afin d’ajouter des personnes au planning.
- Les patients appartiennent désormais à une liste permanente, distincte des lignes du planning quotidien.
- **Ajouter au planning** permet de choisir un patient existant et son intervention. Le même patient peut être ajouté plusieurs fois avec des interventions différentes.
- Cette fenêtre permet également de saisir directement la plage horaire, proposée par défaut de 07:00 à 09:00 puis ajustable sur le planning.
- Supprimer une ligne patient du planning ne supprime pas sa fiche permanente : il peut être ajouté de nouveau ultérieurement.
- Un clic gauche sur une intervention placée sélectionne son infirmière afin de la poser ailleurs autant de fois que nécessaire.
- Un clic droit sur une intervention placée supprime uniquement cette affectation.
- Un clic droit sur la plage horaire d’un patient propose de supprimer le patient et toutes ses affectations, après confirmation.
- Une intervention déjà posée peut être saisie et glissée directement vers un autre horaire ou un autre patient, sans retourner à la liste des infirmières.
- Le bouton **Recommencer** remet toute la démo à zéro.

Les données sont volontairement fictives et intégrées à la démo. Aucune contrainte métier n’est appliquée à ce stade ; elles seront définies après concertation avec la représentante du groupe.

Le fichier `data.json` accompagne la version publiée comme jeu de données fictif lisible et transférable. Il ne contient aucune identité, coordonnée ou donnée de santé réelle.

L’affichage rapproche fortement les lignes patients tout en conservant des rectangles horaires et des affectations suffisamment hauts pour rester lisibles et faciles à manipuler.

Les compteurs sont regroupés avec les titres principaux : le nombre de placements suit immédiatement « Construisons la tournée » et le nombre d’interventions suit le nom de l’infirmière.

Chaque carte d’infirmière affiche également un badge coloré « X soins placés », lisible sans ouvrir ni faire défiler son emploi du temps.

## Sauvegarde et diffusion

- Le planning courant est enregistré automatiquement dans le stockage local du navigateur et restauré à la prochaine ouverture.
- **Enregistrer** force une sauvegarde immédiate et affiche son heure.
- **Valider la journée** conserve une version figée et horodatée ; les modifications ultérieures ne remplacent pas cette version.
- **JSON** exporte le planning courant et toutes les versions validées dans une archive portable.
- **Ouvrir JSON** permet de choisir un fichier dans le Finder et remplace le planning après confirmation.
- **Lier le fichier** reproduit le système de JA Project dans les navigateurs compatibles : le fichier choisi est ensuite réécrit lors des enregistrements. Dans les autres navigateurs, Ouvrir JSON et JSON restent disponibles.
- **PDF** regroupe toute l’équipe dans un document définitif et compact : une fiche par infirmière avec son nom et la liste verticale heure–patient–intervention, puis ouvre la boîte du navigateur où « Enregistrer au format PDF » peut être choisi.
- Dans cette liste, la colonne Intervention est placée immédiatement après la colonne Patient afin d’éviter un grand espace vide.
