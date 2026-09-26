-- KT Studio Importer. Installed once; subsequent imports only need a Studio URL.
local origin = __ORIGIN__
local busy = false

local function message(color, text)
    broadcastToColor(text, color, {1, 0.55, 0.15})
end

local function arrivalPosition()
    local base = self.getPosition()
    local objects = getAllObjects()
    for _, offset in ipairs({{0,-6},{6,-6},{-6,-6},{6,0},{-6,0},{0,6},{6,6},{-6,6}}) do
        local position = base + Vector(offset[1],3,offset[2])
        local clear = true
        for _, object in ipairs(objects) do
            if object ~= self then
                local other = object.getPosition()
                if math.abs(other.x-position.x) < 3 and math.abs(other.z-position.z) < 3 then clear = false; break end
            end
        end
        if clear then return position end
    end
    return base + Vector(0,5,-9)
end

function onLoad()
    self.setName("KT Studio Importer")
    self.setDescription("Import cards and tokens from " .. origin .. "/studio")
    self.createButton({label="IMPORT TEAM", click_function="chooseLink", function_owner=self,
        position={0,0.55,0}, rotation={0,0,0}, width=1800, height=480, font_size=210,
        color={1,0.28,0.03}, font_color={0.05,0.05,0.05}})
end

function chooseLink(_, color)
    if busy then message(color, "An import is already running."); return end
    Player[color].showInputDialog("Paste the TTS link from KT Studio", "", function(value)
        if not value or value:gsub("%s", "") == "" then return end
        importTeam(value, color)
    end)
end

function importTeam(value, color)
    if busy then return end
    if type(value) ~= "string" then return end
    local url = value:gsub("^%s+", ""):gsub("%s+$", "")
    local prefix = origin .. "/api/studio/tts/exports/"
    local id = url:sub(#prefix + 1, #prefix + 36)
    if url:sub(1,#prefix) ~= prefix or url:sub(#prefix + 37) ~= "/manifest" or #id ~= 36 or id:find("[^0-9a-f%-]") then
        message(color, "Use a TTS export link from " .. origin .. "/studio"); return
    end
    busy = true
    message(color, "Loading team...")
    local requestId = {}
    local active = requestId
    Wait.time(function()
        if active == requestId then active = nil; busy = false; message(color, "The server did not respond. Try again.") end
    end, 60)
    WebRequest.get(url, function(response)
        if active ~= requestId then return end
        active = nil; busy = false
        if response.is_error or response.response_code ~= 200 then
            message(color, "Could not load the export. Check the link and server. Deleted links cannot be imported."); return
        end
        local ok, pack = pcall(JSON.decode, response.text)
        if not ok or type(pack) ~= "table" or pack.format ~= "kt-studio-tts-v1" or type(pack.object) ~= "table" or pack.object.Name ~= "Bag" then
            message(color, "This is not a supported KT Studio export."); return
        end
        local position = arrivalPosition()
        local success, object = pcall(spawnObjectData, {data=pack.object, position=position, rotation={0,180,0}})
        if not success or not object then message(color, "TTS could not create the team box."); return end
        message(color, "Imported " .. tostring(pack.teamName) .. ". Use PLACE on the bag to unpack it.")
    end)
end
