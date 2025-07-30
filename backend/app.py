from flask import Flask, request, jsonify
from flask_cors import CORS
import pymongo
from datetime import datetime
import joblib
import numpy as np

app = Flask(__name__)
CORS(app)

client = pymongo.MongoClient("mongodb://localhost:27017/")
db = client['smart_toilet']
collection = db['sensor_data_28/07']

# Load your trained scikit-learn model and scaler
scaler = joblib.load('model/scaler.pkl')
model = joblib.load('model/toilet_cleaning_model.pkl')
last_prediction = False

# --- NEW: Sensor alert LED flag ---
sensor_led_on = False

@app.route('/api/sensor', methods=['POST'])
def receive_sensor():
    global last_prediction
    data = request.json
    # Save timestamp as ISO string
    data['timestamp'] = datetime.now().isoformat()
    collection.insert_one(data)

    # Run AI/ML model on latest data
    features = np.array([[data['usageCount'], data['occupancy'], data['odor'], data['humidity']]])
    features_scaled = scaler.transform(features)
    needs_cleaning = bool(model.predict(features_scaled)[0])
    print("AI INPUT:", features, "AI SCALED:", features_scaled, "AI OUTPUT:", needs_cleaning)
    last_prediction = needs_cleaning
    return jsonify({'status': 'ok', 'needs_cleaning': needs_cleaning})

@app.route('/api/command', methods=['GET'])
def command():
    # ESP32 polls this to check if LED should blink (AI-based)
    return jsonify({'needs_cleaning': last_prediction})

@app.route('/api/sensor', methods=['GET'])
def get_data():
    docs = list(collection.find({}, {'_id': 0}))
    return jsonify(docs)

reset_flag = False

@app.route('/api/reset', methods=['POST'])
def reset_usage():
    global last_prediction, reset_flag, sensor_led_on
    last_prediction = False
    reset_flag = True  # Tell ESP32 to reset usageCount too!
    sensor_led_on = False  # ALSO turn off sensor alert LED on reset!
    collection.update_many({}, {'$set': {'usageCount': 0}})
    return jsonify({'status': 'reset done'})

@app.route('/api/reset_state', methods=['GET'])
def get_reset_flag():
    global reset_flag
    val = reset_flag
    reset_flag = False
    return jsonify({'reset': val})

# --- NEW: Manual sensor alert LED control (from dashboard/JS) ---
@app.route('/api/sensor_alert_led', methods=['POST'])
def set_sensor_led():
    global sensor_led_on
    data = request.json
    sensor_led_on = bool(data.get('led', False))
    return jsonify({'led': sensor_led_on})

@app.route('/api/sensor_alert_led', methods=['GET'])
def get_sensor_led():
    global sensor_led_on
    return jsonify({'led': sensor_led_on})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
