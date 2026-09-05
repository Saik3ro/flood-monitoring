# Task: Fix the already integrated firebase authentication process so that there are two user interface depending on the type of user.

## Description
Create a dedicated admin account using this specific email address 'langgamen.carlsyker@gmail.com' and any other email addresses used or created and saved in firebase will be Users.

## Todo List
* Remove the 'Admin Mode' toggle slider located in the Profile Tab as Admin and its flow. Instead there will be a dedicated admin account using 'langgamen.carlsyker@gmail.com'
* Fix the problem that the image profile of USERS and ADMIN are not shown in the image circle located at the top right of the website dashboard. The image circle must be able to display the profile picture of the users' google account
* Replace the mock data in the User Access Tab as Admin to fill the role with already existing accounts in firebase database
* When editing the Camera Configuration Tab as Admin, any changes made must be reflected in both the website and mongoDB database
* When an Admin changes the role of an existing account, that account's role and access to specific features tied onto specific roles must be saved
* After all the task mentioned above are finished, update LOGS.md file to document the changes made


## Acceptance Criteria
* Users and Admins can now see their google profile picture displayed in the image circle
* The Admin Mode slider is removed 
* Mock data is removed from the User Access Tab and exisiting or real google accounts are displayed instead
* Any changes made in User Access or Camera Configuration are saved into firebase or mongoDB database respectively
* Any changes made will not break the current status or condition of the website as of now
