-- A token-shaped infinite container. Its contents carry KTUI tags; the
-- container deliberately does not, so KTUI never consumes the dispenser.
local millimetres = __SIZE_MM__
local calibrated = false
function onLoad(saved)
    if saved and saved ~= "" then
        local ok, data = pcall(JSON.decode, saved)
        calibrated = ok and type(data) == "table" and data.calibrated == true
    end
    if calibrated then return end
    Wait.condition(function()
        Wait.frames(function()
            local size = self.getBoundsNormalized().size
            local diameter = math.max(size.x, size.z)
            if diameter <= 0 then return end
            local scale = self.getScale()
            local ratio = (millimetres / 25.4) / diameter
            self.setScale({scale.x*ratio, scale.y*ratio, scale.z*ratio})
            calibrated = true
        end, 2)
    end, function() return not self.loading_custom end, 30)
end
function onSave() return JSON.encode({calibrated=calibrated}) end
