# -*- coding: utf-8 -*-
from flask import Flask, request, jsonify, send_from_directory
import requests
import os

app = Flask(__name__, static_folder='.', static_url_path='')

GAODE_KEY = ''  # 只保存在后端
DEEPSEEK_API_KEY = ''
DEEPSEEK_API_ENDPOINT = 'https://api.deepseek.com/v1'

@app.route('/')
def index():
    return send_from_directory('.', 'index.html')

@app.route('/<path:filename>')
def serve_static(filename):
    return send_from_directory('.', filename)

# 逆地理编码接口
@app.route('/api/geocode', methods=['GET'])
def geocode():
    lng = request.args.get('lng')
    lat = request.args.get('lat')
    if not lng or not lat:
        return jsonify({'error': '缺少参数'}), 400
    url = f'https://restapi.amap.com/v3/geocode/regeo?location={lng},{lat}&key={GAODE_KEY}&extensions=all'
    resp = requests.get(url)
    return jsonify(resp.json())

# 行政区划查询接口
@app.route('/api/district', methods=['GET'])
def district():
    adcode = request.args.get('adcode')
    if not adcode:
        return jsonify({'error': '缺少参数'}), 400
    url = f'https://restapi.amap.com/v3/config/district?keywords={adcode}&subdistrict=0&extensions=all&key={GAODE_KEY}'
    resp = requests.get(url)
    #输出到text文件
    #with open('district_response.txt', 'w', encoding='utf-8') as f:
    #     f.write(resp.text)
    return jsonify(resp.json())

@app.route('/api/deepseek/chat', methods=['POST'])
def deepseek_chat():
    data = request.json
    style = data.get('style', 'default')
    messages = data.get('messages', [])

    # 提示词模板
    prompts = {
        "default": "请根据上下文提供专业、准确的回答。",
        "study": {
            "default": "请提供关于该地区的小学地理知识点。100字以内。",
            "beginner": "请提供适合初中生的地理知识点。200字以内。",
            "advanced": "请提供适合高中生的地理知识点。300字以内。",
            "practical": "请提供适合大学生的地理知识点。500字以内。",
            "professional": "请提供适合研究生的地理知识点。1000字以内。"
        }
    }

    def process_prompt(style, content):
        if style.startswith('study'):
            study_templates = prompts["study"]
            style_key = style.split('.', 1)[-1]
            template = study_templates.get(style_key, study_templates.get("default", ""))
        else:
            template = prompts.get(style, prompts.get("default", ""))
        return f"{template}{content}"

    processed_messages = []
    for msg in messages:
        if msg.get('role') == 'user':
            processed_messages.append({
                **msg,
                "content": process_prompt(style, msg.get('content', ''))
            })
        else:
            processed_messages.append(msg)

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {DEEPSEEK_API_KEY}"
    }
    payload = {
        "model": "deepseek-chat",
        "messages": processed_messages
    }
    resp = requests.post(f"{DEEPSEEK_API_ENDPOINT}/chat/completions", headers=headers, json=payload)
    return jsonify(resp.json())

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
