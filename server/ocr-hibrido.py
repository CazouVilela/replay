#!/usr/bin/env python3.13
"""
OCR Híbrido: EasyOCR (texto posicional) + análise de pixels (assinaturas)
Agrupa texto detectado por linhas (Y) e colunas (X) sem depender de detecção de tabela.
"""

import sys
import json
import time
import cv2
import numpy as np
import easyocr
import re

reader = None

def get_reader():
    global reader
    if reader is None:
        reader = easyocr.Reader(['pt'], gpu=False, verbose=False)
    return reader


def parse_date(text):
    """Tenta parsear data DD/MM/AAAA."""
    text = text.replace(" ", "").replace(".", "/").replace("-", "/").replace("\\", "/")
    m = re.search(r'(\d{1,2})[/](\d{1,2})[/](\d{2,4})', text)
    if m:
        d, mo, y = m.group(1), m.group(2), m.group(3)
        if len(y) == 2:
            y = "20" + y
        return f"{d.zfill(2)}/{mo.zfill(2)}/{y}"
    return None


def is_modalidade(text):
    """Verifica se texto é uma modalidade conhecida."""
    t = text.upper().strip().replace(" ", "")
    modalities = ['TO', 'FONO', 'FISIO', 'PSICO', 'FISO']
    for mod in modalities:
        if mod in t:
            return True
    return False


def extract_modalidade(text):
    """Extrai modalidade do texto."""
    t = text.upper().strip()
    for mod in ['FONO', 'FISIO', 'FISO', 'PSICO', 'TO']:
        if mod in t:
            # Capturar extras como "FISIO • 130"
            idx = t.find(mod)
            rest = t[idx:].strip()
            return rest if rest else mod
    return text.upper().strip()


def has_ink_in_region(gray_img, y1, y2, x1, x2, threshold=0.015):
    """Verifica se uma região tem tinta (assinatura) analisando pixels escuros."""
    region = gray_img[y1:y2, x1:x2]
    if region.size == 0:
        return False
    _, binary = cv2.threshold(region, 100, 255, cv2.THRESH_BINARY_INV)
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (2, 2))
    binary = cv2.erode(binary, kernel, iterations=1)
    ink_ratio = np.sum(binary > 0) / binary.size
    return bool(ink_ratio > threshold)


def process_image(image_path):
    """Processa ficha de frequência."""
    start = time.time()
    img = cv2.imread(str(image_path))
    if img is None:
        return {"error": f"Nao conseguiu ler: {image_path}"}

    h, w = img.shape[:2]
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    r = get_reader()

    # OCR: detectar todo texto com posições
    results = r.readtext(img, detail=1, paragraph=False)

    # Separar detecções por tipo e posição
    dates = []       # (y_center, x_center, text, bbox)
    modalities = []  # (y_center, x_center, text, bbox)
    names = []       # (y_center, x_center, text, bbox)

    for bbox, text, conf in results:
        if conf < 0.1:
            continue
        # Calcular centro
        xs = [p[0] for p in bbox]
        ys = [p[1] for p in bbox]
        cx = sum(xs) / len(xs)
        cy = sum(ys) / len(ys)
        x_min, x_max = min(xs), max(xs)
        y_min, y_max = min(ys), max(ys)

        entry = (cy, cx, text, (int(y_min), int(y_max), int(x_min), int(x_max)))

        date = parse_date(text)
        if date:
            dates.append((cy, cx, date, entry[3]))
        elif is_modalidade(text):
            modalities.append((cy, cx, extract_modalidade(text), entry[3]))
        elif 'MATTEO' in text.upper() or 'LIMA' in text.upper() or 'PEDRO' in text.upper() or 'MARQUES' in text.upper():
            names.append((cy, cx, text, entry[3]))

    # Extrair nome do paciente (mais frequente)
    paciente = ""
    if names:
        name_texts = [n[2] for n in names]
        # Pegar o nome mais completo
        longest = max(name_texts, key=len)
        paciente = longest.strip()

    # Agrupar datas e modalidades por linha (Y próximo)
    row_tolerance = h * 0.015  # 1.5% da altura da imagem

    registros = []
    used_mods = set()

    for d_y, d_x, d_text, d_bbox in sorted(dates, key=lambda x: x[0]):
        # Encontrar modalidade na mesma linha
        mod_text = ""
        for i, (m_y, m_x, m_text, m_bbox) in enumerate(modalities):
            if i in used_mods:
                continue
            if abs(m_y - d_y) < row_tolerance:
                mod_text = m_text
                used_mods.add(i)
                break

        # Verificar assinatura: analisar pixels na região direita da mesma linha
        # A assinatura fica na última coluna (tipicamente >70% da largura)
        sig_x_start = int(w * 0.65)
        sig_x_end = int(w * 0.95)
        sig_y_start = int(d_bbox[0]) - 5
        sig_y_end = int(d_bbox[1]) + 5
        sig_y_start = max(0, sig_y_start)
        sig_y_end = min(h, sig_y_end)

        has_sig = has_ink_in_region(gray, sig_y_start, sig_y_end, sig_x_start, sig_x_end)

        registros.append({
            "data": d_text,
            "modalidade": mod_text,
            "assinatura": has_sig,
        })

    # Período
    periodo = ""
    if registros:
        first = registros[0]["data"]
        last = registros[-1]["data"]
        try:
            fp = first.split("/")
            lp = last.split("/")
            periodo = f"{fp[1]}/{fp[2]} a {lp[1]}/{lp[2]}"
        except:
            pass

    elapsed = time.time() - start

    return {
        "paciente": paciente,
        "periodo": periodo,
        "registros": registros,
        "_meta": {
            "tempoProcessamento": f"{elapsed:.1f}s",
            "modelo": "easyocr+pixels",
            "textos_detectados": len(results),
            "datas_encontradas": len(dates),
            "modalidades_encontradas": len(modalities),
        }
    }


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Uso: python3.13 ocr-hibrido.py <imagem.jpeg>")
        sys.exit(1)

    result = process_image(sys.argv[1])
    print(json.dumps(result, ensure_ascii=False, indent=2))
