#!/usr/bin/env python3
"""
extract_geopdf.py
-----------------
Extrait les métadonnées de géoréférencement d'un GeoPDF exporté depuis QGIS.
Produit un fichier .json sidecar utilisable par l'application cartographique PWA.

Usage:
    python3 extract_geopdf.py <fichier.pdf>
    python3 extract_geopdf.py Circuit_canotable.pdf

Sortie:
    Circuit_canotable.json  (même répertoire que le PDF)

Dépendances: aucune (stdlib Python seulement)
"""

import sys
import json
import re
import os
from pathlib import Path


def parse_pdf_array(text, start):
    """Extrait un tableau PDF [ ... ] à partir de la position start."""
    depth = 0
    i = start
    begin = -1
    while i < len(text):
        if text[i] == '[':
            if begin == -1:
                begin = i
            depth += 1
        elif text[i] == ']':
            depth -= 1
            if depth == 0:
                return text[begin:i+1]
        i += 1
    return None


def extract_numbers(s):
    """Extrait tous les nombres flottants d'une chaîne."""
    return [float(x) for x in re.findall(r'[-+]?\d+\.?\d*(?:[eE][-+]?\d+)?', s)]


def extract_georef(pdf_path):
    """
    Lit un GeoPDF et extrait:
    - GPTS: coordonnées WGS84 (lat, lon) des coins
    - LPTS: coordonnées normalisées correspondantes [0-1]
    - MediaBox: dimensions en points PDF
    - Projection WKT et EPSG
    """
    with open(pdf_path, 'rb') as f:
        raw = f.read()

    text = raw.decode('latin-1', errors='replace')

    # --- MediaBox (dimensions du PDF) ---
    mb_match = re.search(r'MediaBox\s*\[\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\]', text)
    if not mb_match:
        raise ValueError("MediaBox introuvable dans le PDF")
    pdf_width = float(mb_match.group(3))
    pdf_height = float(mb_match.group(4))

    # --- GPTS (Ground Points = lat/lon WGS84) ---
    gpts_idx = text.find('/GPTS')
    if gpts_idx == -1:
        raise ValueError("Pas de métadonnées /GPTS trouvées. Ce PDF n'est peut-être pas un GeoPDF OGC.")

    gpts_arr = parse_pdf_array(text, gpts_idx + 5)
    if not gpts_arr:
        raise ValueError("Impossible de parser le tableau /GPTS")
    gpts_vals = extract_numbers(gpts_arr)
    if len(gpts_vals) % 2 != 0:
        raise ValueError(f"Nombre impair de valeurs GPTS: {gpts_vals}")

    # Grouper par paires (lat, lon)
    gpts = [(gpts_vals[i], gpts_vals[i+1]) for i in range(0, len(gpts_vals), 2)]

    # --- LPTS (Local Points = coordonnées normalisées 0-1) ---
    lpts_idx = text.find('/LPTS')
    lpts = []
    if lpts_idx != -1:
        lpts_arr = parse_pdf_array(text, lpts_idx + 5)
        if lpts_arr:
            lpts_vals = extract_numbers(lpts_arr)
            lpts = [(lpts_vals[i], lpts_vals[i+1]) for i in range(0, len(lpts_vals), 2)]

    # --- EPSG ---
    epsg_match = re.search(r'/EPSG\s+(\d+)', text)
    epsg = int(epsg_match.group(1)) if epsg_match else None

    # --- WKT de projection ---
    wkt_match = re.search(r'/WKT\s*\(([^)]+)\)', text)
    wkt = wkt_match.group(1) if wkt_match else None

    # --- Bbox dérivée ---
    lats = [p[0] for p in gpts]
    lons = [p[1] for p in gpts]

    # --- Correspondance coins (depuis LPTS) ---
    # LPTS standard QGIS: [0,1]=TopLeft, [0,0]=BottomLeft, [1,0]=BottomRight, [1,1]=TopRight
    corners = {}
    lpts_labels = {(0,1): 'top_left', (0,0): 'bottom_left', (1,0): 'bottom_right', (1,1): 'top_right'}
    for lpt, gpt in zip(lpts, gpts):
        key = tuple(lpt)
        label = lpts_labels.get(key, str(key))
        corners[label] = {'lat': gpt[0], 'lon': gpt[1]}

    result = {
        "name": Path(pdf_path).stem,
        "pdf_file": Path(pdf_path).name,
        "projection_epsg": epsg,
        "projection_wkt": wkt,
        "pdf_width_pts": pdf_width,
        "pdf_height_pts": pdf_height,
        "gpts": [{"lat": p[0], "lon": p[1]} for p in gpts],
        "lpts": [list(p) for p in lpts],
        "corners": corners,
        "bounds_wgs84": {
            "lat_min": min(lats),
            "lat_max": max(lats),
            "lon_min": min(lons),
            "lon_max": max(lons)
        },
        "center_wgs84": {
            "lat": (min(lats) + max(lats)) / 2,
            "lon": (min(lons) + max(lons)) / 2
        }
    }

    return result


def main():
    if len(sys.argv) < 2:
        print("Usage: python3 extract_geopdf.py <fichier.pdf>")
        sys.exit(1)

    pdf_path = sys.argv[1]
    if not os.path.exists(pdf_path):
        print(f"Erreur: fichier introuvable: {pdf_path}")
        sys.exit(1)

    print(f"Lecture de: {pdf_path}")

    try:
        data = extract_georef(pdf_path)
    except ValueError as e:
        print(f"Erreur d'extraction: {e}")
        sys.exit(1)

    # Sortie JSON
    output_path = Path(pdf_path).with_suffix('.json')
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    print(f"\n✓ Métadonnées extraites avec succès")
    print(f"  Projection  : EPSG:{data['projection_epsg']}")
    print(f"  Dimensions  : {data['pdf_width_pts']} x {data['pdf_height_pts']} pts")
    print(f"  Lat range   : {data['bounds_wgs84']['lat_min']:.6f} → {data['bounds_wgs84']['lat_max']:.6f}")
    print(f"  Lon range   : {data['bounds_wgs84']['lon_min']:.6f} → {data['bounds_wgs84']['lon_max']:.6f}")
    print(f"  Coins       : {list(data['corners'].keys())}")
    print(f"\n→ Fichier JSON: {output_path}")

    return data


if __name__ == '__main__':
    main()
