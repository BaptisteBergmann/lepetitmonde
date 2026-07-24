-- New notification sent to a member (not admins) when an admin adds them to
-- a circle, so they know they now have access to that circle's content.
ALTER TYPE "public"."notification_type" ADD VALUE 'circle_access_granted';
