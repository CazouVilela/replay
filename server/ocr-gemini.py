#!/usr/bin/env python3.13
"""
OCR via Gemini Flash (tier gratuito do Google AI Studio).
"""

import sys
import json
import time
import base64
import re
from pathlib import Path
from google import genai

PROMPT = """Faca o OCR da tabela nessa imagem e retorne os dados como JSON.

Na coluna assinatura: true se existe uma assinatura, false se nao existe.
Se nao tiver certeza de algum campo, adicione "?" no final do valor.

Retorne APENAS o JSON puro, sem markdown e sem texto adicional:

{
  "paciente": "nome do paciente",
  "periodo": "MM/AAAA a MM/AAAA",
  "registros": [
    {"data": "DD/MM/AAAA", "modalidade": "texto visivel", "assinatura": true}
  ]
}"""


def process_image(image_path, api_key):
    client = genai.Client(api_key=api_key)

    img_bytes = Path(image_path).read_bytes()

    ext = Path(image_path).suffix.lower()
    mime_map = {'.jpeg': 'image/jpeg', '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp'}
    mime = mime_map.get(ext, 'image/jpeg')

    start = time.time()
    response = client.models.generate_content(
        model='gemini-2.5-flash',
        contents=[
            genai.types.Part.from_bytes(data=img_bytes, mime_type=mime),
            PROMPT,
        ],
    )
    elapsed = time.time() - start

    text = response.text.strip()

    # Remover markdown fences
    if text.startswith('```'):
        lines = text.split('\n')
        text = '\n'.join(lines[1:-1] if lines[-1].strip() == '```' else lines[1:])

    m = re.search(r'\{[\s\S]*\}', text)
    if not m:
        return {"error": "Sem JSON", "raw": text[:500], "_meta": {"tempoProcessamento": f"{elapsed:.1f}s"}}

    data = json.loads(m.group(0))
    data['_meta'] = {
        'tempoProcessamento': f'{elapsed:.1f}s',
        'modelo': 'gemini-2.5-flash',
    }
    return data


if __name__ == '__main__':
    if len(sys.argv) < 3:
        print('Uso: python3.13 ocr-gemini.py <imagem> <GOOGLE_API_KEY>')
        sys.exit(1)

    result = process_image(sys.argv[1], sys.argv[2])
    print(json.dumps(result, ensure_ascii=False, indent=2))
