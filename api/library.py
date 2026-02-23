"""
api/library.py — 프롬프트 라이브러리 API
prompt_library.json 파일의 읽기/쓰기를 담당합니다.
프론트엔드의 작품 > 그룹 > 조각 3단 계층 데이터를 저장·반환합니다.
"""

import os
import json
from aiohttp import web


def setup_library_api(routes, web_dir):
    """프롬프트 라이브러리 관련 API 라우트를 등록한다."""

    data_dir = os.path.join(web_dir, "data")
    if not os.path.exists(data_dir):
        os.makedirs(data_dir)

    library_file = os.path.join(data_dir, "prompt_library.json")

    @routes.get("/assetmanager/api/library")
    async def api_get_library(request):
        """프롬프트 라이브러리 데이터를 반환. 파일이 없으면 빈 기본 구조를 반환."""
        if not os.path.exists(library_file):
            default_lib = {"categories": []}
            return web.json_response(default_lib)
        try:
            with open(library_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
            return web.json_response(data)
        except Exception as e:
            return web.json_response({"status": "error", "message": str(e)}, status=500)

    @routes.post("/assetmanager/api/library")
    async def api_save_library(request):
        """프론트엔드에서 전달받은 라이브러리 데이터를 JSON 파일로 저장"""
        try:
            data = await request.json()
            with open(library_file, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=4, ensure_ascii=False)
            return web.json_response({"status": "success"})
        except Exception as e:
            return web.json_response({"status": "error", "message": str(e)}, status=500)
