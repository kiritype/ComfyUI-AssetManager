"""
api/tools.py — 도구 API (ZIP 다운로드, 이미지 리사이즈)
검열 처리 결과의 일괄 ZIP 다운로드와
이미지 리사이즈(비율/최장변/정확한 크기) 및 포맷 변환 기능을 제공합니다.
"""

import os
import io
import time
import zipfile
import folder_paths
from aiohttp import web


def setup_tools_api(routes):
    """도구 관련 API 라우트를 등록한다."""

    @routes.post("/assetmanager/api/download_zip")
    async def api_download_zip(request):
        """
        지정된 파일명 목록을 output 디렉토리에서 읽어 ZIP으로 압축하여 반환.
        메모리 내에서 압축을 수행하며, 디렉토리 구조 없이 파일명만 보존한다.
        """
        try:
            data = await request.json()
            filenames = data.get("filenames", [])
            if not filenames:
                return web.json_response({"status": "error", "message": "No filenames provided"}, status=400)
                
            output_dir = folder_paths.get_output_directory()
            
            memory_file = io.BytesIO()
            with zipfile.ZipFile(memory_file, 'w', zipfile.ZIP_DEFLATED) as zf:
                for fname in filenames:
                    file_path = os.path.join(output_dir, fname)
                    if os.path.exists(file_path):
                        arcname = os.path.basename(file_path)
                        zf.write(file_path, arcname)
                        
            memory_file.seek(0)
            return web.Response(
                body=memory_file.getvalue(),
                content_type="application/zip",
                headers={"Content-Disposition": 'attachment; filename="censored_images.zip"'}
            )
        except Exception as e:
            return web.json_response({"status": "error", "message": str(e)}, status=500)

    @routes.post("/assetmanager/api/resize")
    async def api_quick_resize(request):
        """
        업로드된 이미지를 지정된 모드로 리사이즈하고, 선택한 포맷으로 변환하여 저장.
        
        지원되는 리사이즈 모드:
          - scale : 백분율 비율로 축소/확대
          - longest : 최장변 기준으로 비율 유지 리사이즈
          - exact : 정확한 가로×세로 크기 지정
        
        결과 파일은 output/AssetManager_Resized/ 폴더에 저장되며,
        ComfyUI /view 엔드포인트를 통해 접근 가능한 URL을 반환한다.
        """
        try:
            data = await request.post()
            img_file = data.get("file")
            if not img_file:
                return web.json_response({"status": "error", "message": "No file uploaded"}, status=400)
                
            mode = data.get("mode", "none")
            format_type = data.get("format", "webp").lower()
            quality = int(data.get("quality", 85))
            
            from PIL import Image
            
            file_content = img_file.file.read()
            img = Image.open(io.BytesIO(file_content))
            
            original_w, original_h = img.size
            new_w, new_h = original_w, original_h
            
            # 리사이즈 모드별 새 크기 계산
            if mode == "scale":
                scale_val = float(data.get("val_scale", 50)) / 100.0
                new_w = int(original_w * scale_val)
                new_h = int(original_h * scale_val)
            elif mode == "longest":
                longest_val = int(data.get("val_longest", 1024))
                if original_w >= original_h:
                    new_w = longest_val
                    new_h = int(original_h * (longest_val / original_w))
                else:
                    new_h = longest_val
                    new_w = int(original_w * (longest_val / original_h))
            elif mode == "exact":
                new_w = int(data.get("val_width", 512))
                new_h = int(data.get("val_height", 512))
                
            if (new_w, new_h) != (original_w, original_h) and new_w > 0 and new_h > 0:
                resample_filter = getattr(Image, 'Resampling', Image).LANCZOS
                img = img.resize((new_w, new_h), resample_filter)
                
            # JPEG는 투명도 미지원이므로 RGBA→RGB 변환 (흰 배경 합성)
            if format_type == "jpeg" and img.mode in ("RGBA", "P"):
                background = Image.new("RGB", img.size, (255, 255, 255))
                if img.mode == "P":
                    img = img.convert("RGBA")
                background.paste(img, mask=img.split()[3])
                img = background
            elif format_type == "png" and img.mode == "P":
                img = img.convert("RGBA")
                
            output_dir = folder_paths.get_output_directory()
            resized_dir = os.path.join(output_dir, "AssetManager_Resized")
            if not os.path.exists(resized_dir):
                os.makedirs(resized_dir)
                
            original_name = img_file.filename
            name_no_ext = os.path.splitext(original_name)[0]
            timestamp = int(time.time() * 1000)
            
            final_ext = f".{format_type}"
            final_filename = f"{name_no_ext}_res_{timestamp}{final_ext}"
            final_path = os.path.join(resized_dir, final_filename)
            
            save_kwargs = {}
            if format_type in ["jpeg", "webp"]:
                save_kwargs["quality"] = quality
                
            img.save(final_path, format=format_type.upper(), **save_kwargs)
            
            view_url = f"/view?filename={final_filename}&subfolder=AssetManager_Resized&type=output"
            
            return web.json_response({
                "status": "success", 
                "filename": final_filename, 
                "url": view_url
            })
            
        except Exception as e:
            return web.json_response({"status": "error", "message": f"Resize Error: {str(e)}"}, status=500)
