"""Download reusable Wikimedia Commons thumbnails and their attribution metadata."""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import hashlib
import html
import json
import re
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
PHOTOS = [
    ('calcada-rachada', 'Calçada', 'Cracked sidewalk 1.jpg'),
    ('calcada-quebrada', 'Calçada', 'Acera quebrada de concreto no reparada en Maracay, Venezuela.jpg'),
    ('poste-danificado', 'Iluminação', 'Broken Street Light Stevenage (The White Way Lamppost 26) - geograph.org.uk - 8268947.jpg'),
    ('luminaria-danificada', 'Iluminação', 'Damaged public street light, Feijenoord, Rotterdam (2021) 04.jpg'),
    ('lixo-descartado', 'Lixo', 'Illegal rubbish dumping.jpg'),
    ('residuos-acumulados', 'Lixo', 'Illegal dumping of rubbish - geograph.org.uk - 8039864.jpg'),
    ('buracos-asfalto', 'Buraco', 'Potholes in Bengaluru road.jpg'),
    ('buraco-pista', 'Buraco', 'Pothole in Villeray, Montréal.jpg'),
    ('bueiro-obstruido', 'Água e esgoto', 'Blocked Drain - geograph.org.uk - 288442.jpg'),
    ('drenagem-alagada', 'Água e esgoto', 'Blocked Drain Gully Mystery.jpg'),
    ('banco-quebrado', 'Espaço público', 'At Parque Buenos Aires 2023 046.jpg'),
    ('banco-danificado', 'Espaço público', 'Broken Bench (20949764078).jpg'),
]
HEADERS = {'User-Agent': 'LikeCidadeDemo/1.0 (educational illustrative dataset; https://likecidade.com.br)'}
params = {'action': 'query', 'format': 'json', 'titles': '|'.join('File:' + p[2] for p in PHOTOS), 'prop': 'imageinfo', 'iiprop': 'url|extmetadata', 'iiurlwidth': '960'}
request = urllib.request.Request('https://commons.wikimedia.org/w/api.php?' + urllib.parse.urlencode(params), headers=HEADERS)
with urllib.request.urlopen(request, timeout=30) as response:
    pages = json.load(response)['query']['pages'].values()
by_title = {p['title']: p['imageinfo'][0] for p in pages if 'imageinfo' in p}

def fetch(entry):
    key, category, title = entry
    info = by_title['File:' + title]
    metadata = info['extmetadata']
    def plain(name):
        return html.unescape(re.sub('<[^>]+>', '', metadata.get(name, {}).get('value', ''))).strip()
    license_name = plain('LicenseShortName')
    if not (license_name.startswith('CC BY') or license_name in ('CC0', 'Public domain')):
        raise ValueError('Review image license: ' + title)
    author = plain('Artist')
    if author.startswith('Donald Trung Quoc Don'):
        author = 'Donald Trung Quoc Don'
    url = info.get('thumburl', info['url'])
    with urllib.request.urlopen(urllib.request.Request(url, headers=HEADERS), timeout=40) as response:
        photo = response.read()
    if not photo.startswith(b'\xff\xd8\xff') or len(photo) > 3 * 1024 * 1024:
        raise ValueError('Expected JPEG smaller than 3 MB: ' + title)
    file = 'photos/' + key + '.jpg'
    (ROOT / 'demo-data' / file).write_bytes(photo)
    print(key, len(photo), flush=True)
    return {'key': key, 'category': category, 'file': file, 'title': title, 'author': author, 'license': license_name, 'licenseUrl': plain('LicenseUrl'), 'sourceUrl': info['descriptionurl'], 'downloadUrl': url, 'sha256': hashlib.sha256(photo).hexdigest(), 'modifications': 'Nenhuma; miniatura JPEG fornecida pelo Wikimedia Commons.'}

(ROOT / 'demo-data/photos').mkdir(parents=True, exist_ok=True)
with ThreadPoolExecutor(max_workers=2) as executor:
    manifest = list(executor.map(fetch, PHOTOS))
(ROOT / 'demo-data/photo-credits.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
