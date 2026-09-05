# Task: Link the project flood monitoring dashboard to the already build MongoDB Atlas/Compass server.

## Description
An already built mongoDB server in Compass or Atlas is ready to be connected to the project. The mongoDB will be the universal database for both the mobile application routing advisory and the website monitor dashboard. Make sure the project is connected and is shown to be connected. These are the provided credentials of the server for connection, use the necessary ones:
* Project ID: 6a57259a336f5783db213865
* Connection String Drivers: mongodb+srv://langgamencarlsyker_db_user:<db_password>@cluster0.0fpztcp.mongodb.net/?appName=Cluster0
* Connection String Compass: mongodb+srv://langgamencarlsyker_db_user:<db_password>@cluster0.0fpztcp.mongodb.net/

## Acceptance Criteria
The following data that is in the mongoDB database must be reflected in the project when running it locally:
CCTV Data
{
  "_id": {
    "$oid": "6a5739e3639645ea3345c895"
  },
  "status": "danger",
  "water_level": 1.345,
  "location": {
    "type": "Point",
    "coordinates": [
      124.6433,
      8.4822
    ]
  },
  "timestamp": "2026-07-15T07:30:00Z"
}

Tell me what CCTV or Camera Feed you'd use when using the given data