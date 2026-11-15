-- Track only objects taken out by this particular container.
local deployed = {}
local busy = false

function onLoad(saved)
    if saved and saved ~= "" then
        local ok, data = pcall(JSON.decode, saved)
        if ok and type(data) == "table" then deployed = data.deployed or {} end
    end
    self.createButton({label="PLACE", click_function="placeContents", function_owner=self,
        position={0,4,-0.45}, width=1300, height=350, font_size=190, color={1,0.3,0.05}, font_color={0,0,0}})
    self.createButton({label="PACK", click_function="packContents", function_owner=self,
        position={0,4,0.45}, width=1300, height=350, font_size=190})
end

function onSave() return JSON.encode({deployed=deployed}) end

function placeContents()
    if busy then return end
    busy = true
    local contents = self.getObjects()
    for i, item in ipairs(contents) do
        local slot = i - 1
        self.takeObject({guid=item.guid, position=self.getPosition() + Vector((slot % 5)*3-6,2,-4-math.floor(slot/5)*3),
            rotation={0,180,0}, smooth=false, callback_function=function(object)
                deployed[object.getGUID()] = true
            end})
    end
    Wait.frames(function() busy = false end, 2)
end

function packContents()
    if busy then return end
    for guid in pairs(deployed) do
        local object = getObjectFromGUID(guid)
        if not object then deployed[guid] = nil
        elseif not object.held_by_color then
            deployed[guid] = nil
            self.putObject(object)
        end
    end
end
