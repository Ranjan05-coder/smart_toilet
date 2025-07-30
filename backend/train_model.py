import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestClassifier
from sklearn.preprocessing import StandardScaler
import joblib

# 1. Load the new dataset
df = pd.read_csv("smart_toilet_better_ai_2500.csv")
X = df[["usageCount", "occupancy", "odor", "humidity"]]
y = df["needs_cleaning"]

# 2. Scale features
scaler = StandardScaler()
X_scaled = scaler.fit_transform(X)

# 3. Split into train/test
X_train, X_test, y_train, y_test = train_test_split(X_scaled, y, test_size=0.2, random_state=42)

# 4. Train Random Forest model
model = RandomForestClassifier(n_estimators=100, random_state=42)
model.fit(X_train, y_train)

# 5. Evaluate
print("Train acc:", model.score(X_train, y_train))
print("Test acc:", model.score(X_test, y_test))

# 6. Save scaler and model
joblib.dump(scaler, "scaler.pkl")
joblib.dump(model, "toilet_cleaning_model.pkl")
