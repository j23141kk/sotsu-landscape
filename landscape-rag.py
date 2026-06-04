import os
import json
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from google import genai
from dotenv import load_dotenv

load_dotenv()

# 1. 初期設定（FastAPIの起動とCORS設定）
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 2. Gemini APIの初期設定
# 環境変数からAPIキーを自動で読み込みます
client = genai.Client()

# 3. リクエストのデータ構造（ブラウザから送られてくるデータの形）
class LocationRequest(BaseModel):
    location_key: str

# 4. RAG用の簡易データ検索関数（知識ベース）
def get_spot_info(location_key):
    """spots.json から指定された場所の観光テキストを引っ張ってくる関数"""
    try:
        with open('spots.json', 'r', encoding='utf-8') as f:
            spots_data = json.load(f)
        
        # spots.json の中から一致するキーのテキストを返す
        if location_key in spots_data:
            return spots_data[location_key]
        else:
            return "周辺に登録されている特別な観光スポットや歴史的名所はありません。"
            
    except Exception as e:
        print(f"ファイルの読み込みエラー: {e}")
        return "周辺情報を読み込めませんでした。"

# 5. Geminiによる選曲AI関数
def generate_music_tag(sightseeing_text):
    """観光ページの文章を元に、Geminiにぴったりの音楽ジャンル（タグ）を選ばせる関数"""
    
    prompt = f"""
    あなたはドライブの選曲を担当するAIコンシェルジュです。
    以下の【観光スポットの解説文】を読み、その場所の雰囲気や歴史、景色に最もマッチする「音楽のジャンルや雰囲気」を1つだけ提案してください。

    出力は、必ず以下のフォーマットのJSON形式のみで返却してください。余計な挨拶や解説文、Markdownの枠（```json など）は一切含めないでください。

    {{
        "bgm_genre": "（例: 爽快なJ-POP、チルなLo-Fi HipHop、厳かなクラシック など、15文字以内で記述）"
    }}

    【観光スポットの解説文】
    {sightseeing_text}
    """
    
    try:
        # 確実にJSON形式で返信させる設定
        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=prompt,
            config={"response_mime_type": "application/json"}
        )
        return response.text
    except Exception as e:
        print(f"Gemini API エラー: {e}")
        return '{"bgm_genre": "ドライブミュージック"}'

# 6. APIエンドポイント（ブラウザからの連絡を受け取る窓口）
@app.post("/api/guide")
def get_guide(request: LocationRequest):
    current_location = request.location_key
    print(f"現在地【{current_location}】のデータを処理中...")
    
    # ① spots.json から「本物の観光文」を取得
    sightseeing_text = get_spot_info(current_location)
    
    # ② その文章をGeminiに読ませて、選曲タグを生成
    music_json_str = generate_music_tag(sightseeing_text)
    music_data = json.loads(music_json_str)
    
    # ③ 「元の観光文」と「AIの選曲」をセットにしてJavaScriptにまとめて返却！
    return {
        "sightseeing_text": sightseeing_text,
        "bgm_genre": music_data.get("bgm_genre", "ドライブミュージック")
    }