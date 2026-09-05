# Task: Update the manual ROI process and flow using Admin Accounts

## Description
I want to configure the ROI configuration so that it will automatically setup the Region of Interest, I want to be able to hold and select a portion of the screenshot of the camera feed then select a portion of that screen to be the region of interest (ROI) for the entire cctv camera feed whenever it sends a screenshot or frame.

## Task
* Remove the Region of Interest (PX) Configuration setting in the Camera Config Tab when logging in as an Admin Role.
* The new Region of Interest configuration will be a hold and select system much like when editing or cropping an image. The specific section of an image will be used as the region of interest for a cctv camera whenever it is active
* The region of interest will display its values automatically whenever the admin holds and selects a portion of the screenshot or image
* Remove HSV Thresholds configuration setting also in the Camera Config Tab 


## Acceptance Criteria
* Admins are able to edit ROI system by dragging specfic widths and heights of the portion of the screenshot, then ask for confirmation for the newly sized ROI display. Do this for all three cameras separately
* Admins are able to see the values generated once an ROI portion if confirmed or updated in the Camera Config Tab
* The HSV Thresholds setting will not be editable and will only show the used HSV Threshold in the OpenCV config code
* All three cameras are updated and implemented by the new changes.

## Prerequisites
* Read LOGS.md, this is where you will see the recent changes made in the project
* Read SPEC.md, this is the entire identity of the project
* Read RULES.md, this is the guidelines you will follow when working or editing the project
* Always ask when implementing major changes
* Read FloodTestGIT_v0.5.py, this is the OpenCV to be used for the camera system