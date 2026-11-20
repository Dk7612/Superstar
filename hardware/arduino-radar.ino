/*
 * Superstar Arduino Radar Controller
 * Hardware:
 *   SG90 servo signal -> D13
 *   HC-SR04 TRIG -> D9, ECHO -> D8
 *   16x2 LCD: RS=12, E=11, D4=5, D5=4, D6=3, D7=2
 *
 * Serial protocol (9600 baud): angle,distance
 * Distance is centimeters; -1 means an invalid/out-of-range reading.
 *
 * Adjust STEP_DELAY_MS to change sweep speed. Smaller values are faster.
 */

#include <Servo.h>
#include <LiquidCrystal.h>

const byte SERVO_PIN = 13;
const byte TRIG_PIN = 9;
const byte ECHO_PIN = 8;

const int MIN_ANGLE = 45;
const int MAX_ANGLE = 135;
const unsigned int STEP_DELAY_MS = 18; // Tune this for sweep speed.
const unsigned long ECHO_TIMEOUT_US = 30000UL;
const float MAX_VALID_DISTANCE_CM = 400.0f;

Servo radarServo;
LiquidCrystal lcd(12, 11, 5, 4, 3, 2);

int currentAngle = MIN_ANGLE;
int direction = 1;
String previousAngleText = "";
String previousDistanceText = "";

long measureDistanceCm() {
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(3);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);

  unsigned long duration = pulseIn(ECHO_PIN, HIGH, ECHO_TIMEOUT_US);
  if (duration == 0) return -1;

  float distance = duration / 58.0f;
  if (distance <= 0.0f || distance > MAX_VALID_DISTANCE_CM) return -1;
  return lround(distance);
}

void updateLcdField(byte column, byte row, const String &value, String &previous) {
  if (value == previous) return;
  lcd.setCursor(column, row);
  lcd.print(value);
  // Pad the remainder of the field without clearing the whole LCD.
  for (byte i = value.length(); i < 8; i++) lcd.print(' ');
  previous = value;
}

void setup() {
  Serial.begin(9600);
  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
  digitalWrite(TRIG_PIN, LOW);

  lcd.begin(16, 2);
  lcd.setCursor(0, 0);
  lcd.print("Angle:");
  lcd.setCursor(0, 1);
  lcd.print("Dist:");

  radarServo.attach(SERVO_PIN);
  radarServo.write(currentAngle);
  delay(300);
}

void loop() {
  radarServo.write(currentAngle);
  delay(STEP_DELAY_MS);

  long distanceCm = measureDistanceCm();

  // Exact CSV line expected by the browser: angle,distance
  Serial.print(currentAngle);
  Serial.print(',');
  Serial.println(distanceCm);

  updateLcdField(6, 0, String(currentAngle) + " deg", previousAngleText);
  String distanceText = distanceCm < 0 ? "Invalid" : String(distanceCm) + " cm";
  updateLcdField(6, 1, distanceText, previousDistanceText);

  currentAngle += direction;
  if (currentAngle >= MAX_ANGLE) {
    currentAngle = MAX_ANGLE;
    direction = -1;
  } else if (currentAngle <= MIN_ANGLE) {
    currentAngle = MIN_ANGLE;
    direction = 1;
  }
}
