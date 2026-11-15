# -*- coding: utf-8 -*-
"""
navenza_qgis.py — outils de bureau pour NAVenza MAP (5.2 et plus)

1) fusionner_retours(dossier)
   Regroupe tous les envois reçus des employés (fichiers .geojson et .kmz « Envoyer au bureau »)
   en UNE couche : un seul enregistrement par point (identifiant « uid »), la version la plus
   récente gagne (champ « updated_at »). Les photos sont extraites des KMZ dans dossier/photos/.
   Dans QGIS, la couche fusionnée est ajoutée au projet (points et lignes).

2) preparer_calque(fichier_geojson, champs)
   Ajoute à un GeoJSON exporté de QGIS (EPSG:4326) la liste des champs que les employés
   devront remplir dans l'app, avec leur type et, au besoin, les choix possibles.

Utilisation dans QGIS : Extensions > Console Python > Afficher l'éditeur > ouvrir ce fichier >
Exécuter, puis dans la console :
    fusionner_retours(r"C:\\Users\\...\\Retours terrain")
    preparer_calque(r"C:\\...\\suivi_castors_2027.geojson",
                    {"etat": ["actif", "inactif", "démantelé"], "hauteur_eau_cm": "nombre",
                     "accessible": "ouinon", "remarques": "texte"})

En ligne de commande (Python 3, sans QGIS) :
    python navenza_qgis.py fusion "C:\\...\\Retours terrain"
    python navenza_qgis.py champs suivi.geojson "etat=actif|inactif|démantelé;hauteur_eau_cm=nombre"
"""
import json
import os
import sys
import zipfile
from datetime import datetime

TYPES = {"texte": "texte", "text": "texte", "nombre": "nombre", "number": "nombre",
         "ouinon": "ouinon", "oui/non": "ouinon", "bool": "ouinon", "choix": "choix"}


def _cle(f):
    p = f.get("properties") or {}
    if p.get("uid"):
        return str(p["uid"])
    # fichiers d'avant la 5.2 : pas d'uid → auteur + id interne
    return "%s#%s" % (p.get("author") or p.get("device") or "?", p.get("id"))


def _date(f):
    p = f.get("properties") or {}
    return str(p.get("updated_at") or p.get("timestamp") or "")


def _fichiers(dossier, extensions):
    for racine, _, noms in os.walk(dossier):
        if os.path.basename(racine).lower() == "photos":
            continue
        for n in sorted(noms):
            if n.lower().endswith(extensions) and not n.startswith("navenza_fusion"):
                yield os.path.join(racine, n)


def fusionner_retours(dossier, sortie=None, dossier_photos=None, charger=True):
    """Fusionne les .geojson et .kmz reçus dans `dossier`. Retourne le chemin du GeoJSON fusionné."""
    dossier = os.path.abspath(dossier)
    sortie = sortie or os.path.join(dossier, "navenza_fusion.geojson")
    dossier_photos = dossier_photos or os.path.join(dossier, "photos")
    os.makedirs(dossier_photos, exist_ok=True)

    # 1. Photos des KMZ
    n_photos = 0
    for kmz in _fichiers(dossier, (".kmz",)):
        try:
            with zipfile.ZipFile(kmz) as z:
                for nom in z.namelist():
                    if nom.lower().startswith("photos/") and nom.lower().endswith(".jpg"):
                        cible = os.path.join(dossier_photos, os.path.basename(nom))
                        if not os.path.exists(cible):
                            with z.open(nom) as src, open(cible, "wb") as dst:
                                dst.write(src.read())
                            n_photos += 1
        except zipfile.BadZipFile:
            print("  ! KMZ illisible ignoré :", kmz)

    # 2. Entités des GeoJSON, la plus récente par uid
    garde, lus, remplaces, fichiers = {}, 0, 0, 0
    auteurs = {}
    for gj in _fichiers(dossier, (".geojson", ".json")):
        try:
            with open(gj, encoding="utf-8") as fh:
                data = json.load(fh)
        except (ValueError, OSError) as e:
            print("  ! fichier ignoré (%s) : %s" % (e, gj))
            continue
        if data.get("type") != "FeatureCollection":
            continue
        fichiers += 1
        for f in data.get("features", []):
            if not f.get("geometry"):
                continue
            lus += 1
            f.setdefault("properties", {})["fichier_source"] = os.path.basename(gj)
            k = _cle(f)
            if k in garde:
                if _date(f) >= _date(garde[k]):
                    garde[k] = f
                remplaces += 1
            else:
                garde[k] = f

    # 3. Chemins des photos
    for f in garde.values():
        p = f["properties"]
        noms = [n for n in str(p.get("photos") or "").split(";") if n]
        trouves = [os.path.join(dossier_photos, n) for n in noms if os.path.exists(os.path.join(dossier_photos, n))]
        p["photo_fichiers"] = ";".join(trouves)
        p["photos_manquantes"] = len(noms) - len(trouves)
        a = p.get("author") or "(inconnu)"
        auteurs[a] = auteurs.get(a, 0) + 1

    out = {"type": "FeatureCollection", "name": "NAVenza fusion",
           "features": sorted(garde.values(), key=lambda f: (f["properties"].get("layer") or "", f["properties"].get("name") or ""))}
    with open(sortie, "w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False, indent=1)

    print("NAVenza — fusion terminée (%s)" % datetime.now().strftime("%Y-%m-%d %H:%M"))
    print("  %d fichier(s) GeoJSON lus, %d entités, %d en double remplacées par la plus récente" % (fichiers, lus, remplaces))
    print("  %d entités uniques → %s" % (len(garde), sortie))
    print("  %d photo(s) extraite(s) → %s" % (n_photos, dossier_photos))
    for a, n in sorted(auteurs.items()):
        print("    %-20s %d" % (a, n))
    manq = sum(f["properties"]["photos_manquantes"] for f in garde.values())
    if manq:
        print("  ! %d photo(s) annoncée(s) mais absente(s) : joindre aussi les fichiers .kmz reçus" % manq)

    if charger:
        _charger_dans_qgis(sortie)
    return sortie


def _charger_dans_qgis(chemin):
    try:
        from qgis.core import QgsProject, QgsVectorLayer
    except ImportError:
        return
    for geom, nom in (("Point", "NAVenza – points"), ("LineString", "NAVenza – tracés")):
        lyr = QgsVectorLayer(chemin + "|geometrytype=" + geom, nom, "ogr")
        if lyr.isValid() and lyr.featureCount() > 0:
            QgsProject.instance().addMapLayer(lyr)


def preparer_calque(fichier, champs, sortie=None):
    """Ajoute les définitions de champs NAVenza à un GeoJSON (EPSG:4326) exporté de QGIS.
    champs : {"nom_du_champ": "texte" | "nombre" | "ouinon" | ["choix 1", "choix 2", ...]}"""
    with open(fichier, encoding="utf-8") as fh:
        data = json.load(fh)
    crs = (((data.get("crs") or {}).get("properties") or {}).get("name") or "")
    if crs and "4326" not in crs and "CRS84" not in crs:
        raise ValueError("Le fichier est en %s : réexportez la couche en EPSG:4326 (WGS84)." % crs)
    defs = []
    for nom, t in champs.items():
        if isinstance(t, (list, tuple)):
            defs.append({"cle": nom, "nom": nom.replace("_", " "), "type": "choix", "choix": [str(c) for c in t]})
        else:
            if str(t).lower() not in TYPES:
                raise ValueError("Type inconnu pour %s : %s (texte, nombre, ouinon ou liste de choix)" % (nom, t))
            defs.append({"cle": nom, "nom": nom.replace("_", " "), "type": TYPES[str(t).lower()], "choix": []})
    data["navenza"] = {"version": 1, "calque": data.get("name"), "champs": defs}
    sortie = sortie or fichier
    with open(sortie, "w", encoding="utf-8") as fh:
        json.dump(data, fh, ensure_ascii=False, indent=1)
    print("NAVenza — %d champ(s) ajouté(s) à %s" % (len(defs), sortie))
    return sortie


if __name__ == "__main__" and len(sys.argv) >= 3:
    if sys.argv[1] == "fusion":
        fusionner_retours(sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else None, charger=False)
    elif sys.argv[1] == "champs" and len(sys.argv) >= 4:
        spec = {}
        for part in sys.argv[3].split(";"):
            if "=" in part:
                k, v = part.split("=", 1)
                spec[k.strip()] = v.split("|") if "|" in v else v.strip()
        preparer_calque(sys.argv[2], spec)
