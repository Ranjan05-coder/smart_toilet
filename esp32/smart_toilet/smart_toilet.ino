#include <WiFi.h>
#include <HTTPClient.h>
#include <DHT.h>

#define IR_PIN 15
#define PIR_PIN 4
#define MQ135_PIN 36
#define LED_PIN 2
#define DHTPIN 16
#define DHTTYPE DHT11
DHT dht(DHTPIN, DHTTYPE);

const char* ssid = "Airtel_prem_5771";
const char* password = "air76846";
const char* serverName = "http://192.168.1.9:5000/api/sensor";
const char* getCommandURL = "http://192.168.1.9:5000/api/command";
const char* resetFlagURL  = "http://192.168.1.9:5000/api/reset_state";

int usageCount = 0;
bool lastIR = LOW;
bool needsCleaning = false; // Only AI alert controls LED

void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("ESP32 Smart Toilet: Booting up!");

  dht.begin();
  pinMode(IR_PIN, INPUT);
  pinMode(PIR_PIN, INPUT);
  pinMode(LED_PIN, OUTPUT);

  WiFi.begin(ssid, password);
  Serial.print("Connecting to WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nConnected!");
  Serial.print("Local IP: ");
  Serial.println(WiFi.localIP());
}

void loop() {
  // 0. Poll for backend reset flag, and reset usageCount if needed
  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    http.begin(resetFlagURL);
    int httpCode = http.GET();
    Serial.print("Reset flag httpCode: "); Serial.println(httpCode);
    if (httpCode == HTTP_CODE_OK) {
      String payload = http.getString();
      Serial.print("Reset flag payload: "); Serial.println(payload);
      if (payload.indexOf("true") != -1) {
        usageCount = 0;
        Serial.println("ESP32 usageCount reset by backend!");
      }
    }
    http.end();
  }

  // 1. Read sensors
  bool irState = digitalRead(IR_PIN);
  if (irState == HIGH && lastIR == LOW) {
    usageCount++;
    Serial.print("Usage incremented to: "); Serial.println(usageCount);
    delay(200);
  }
  lastIR = irState;

  bool pirState = digitalRead(PIR_PIN);
  int odorRaw = analogRead(MQ135_PIN);
  float temp = dht.readTemperature();
  float hum = dht.readHumidity();
  int odor = map(odorRaw, 0, 4095, 0, 500);

  // 2. Prepare JSON
  String jsonData = "{";
  jsonData += "\"usageCount\":" + String(usageCount) + ",";
  jsonData += "\"occupancy\":" + String(pirState) + ",";
  jsonData += "\"odor\":" + String(odor) + ",";
  jsonData += "\"temperature\":" + String(temp) + ",";
  jsonData += "\"humidity\":" + String(hum);
  jsonData += "}";
  Serial.print("Posting JSON: "); Serial.println(jsonData);

  // 3. Send data to backend
  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    http.begin(serverName);
    http.addHeader("Content-Type", "application/json");
    int resp = http.POST(jsonData);
    Serial.print("POST /api/sensor response: "); Serial.println(resp);
    http.end();
  }

  // 4. Get AI cleaning command from backend
  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    http.begin(getCommandURL);
    int httpCode = http.GET();
    Serial.print("GET /api/command httpCode: "); Serial.println(httpCode);
    if (httpCode == HTTP_CODE_OK) {
      String payload = http.getString();
      Serial.print("AI command payload: "); Serial.println(payload);
      needsCleaning = (payload.indexOf("true") != -1);
    }
    http.end();
  }

  // 5. BLINK LED only if AI says needs cleaning
  if (needsCleaning) {
    digitalWrite(LED_PIN, HIGH);
    delay(300);
    digitalWrite(LED_PIN, LOW);
    delay(300);
  } else {
    digitalWrite(LED_PIN, LOW);
    delay(1000);
  }
}
