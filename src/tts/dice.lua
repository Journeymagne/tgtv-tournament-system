-- Preserve native D6 rolling and values; only calibrate its physical size.
local millimetres = __SIZE_MM__
local calibrated = false
function onLoad(saved)
    if saved and saved ~= "" then
        local ok, state = pcall(JSON.decode, saved)
        calibrated = ok and type(state) == "table" and state.calibrated == true
    end
    if calibrated then return end
    Wait.condition(function()
        Wait.frames(function()
            local size = self.getBoundsNormalized().size
            local edge = math.max(size.x, size.y, size.z)
            if edge <= 0 then return end
            local scale = self.getScale()
            local ratio = (millimetres / 25.4) / edge
            self.setScale({scale.x*ratio, scale.y*ratio, scale.z*ratio})
            calibrated = true
        end, 2)
    end, function() return not self.loading_custom end, 30)
end
function onSave() return JSON.encode({calibrated=calibrated}) end
