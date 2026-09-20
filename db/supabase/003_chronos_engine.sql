-- Creates an unhackable server-side clock endpoint
CREATE OR REPLACE FUNCTION get_server_time()
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
SECURITY DEFINER -- Runs with elevated privileges to guarantee execution
AS $$
BEGIN
    RETURN now();
END;
$$;
